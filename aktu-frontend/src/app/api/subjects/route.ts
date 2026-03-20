import { NextRequest } from 'next/server';
import axios from 'axios';
import { CookieJar } from 'tough-cookie';
import { wrapper } from 'axios-cookiejar-support';
import { jsonError, jsonOk, makeRequestId } from '../_utils';
import { findSelectOptions, pickNonPlaceholder } from '../_parse';

const BASE_URL = 'https://aktuexams.in';
const BASE_PATH = '/AKTU';
const ANSWER_URL = `${BASE_URL}${BASE_PATH}/StudentServices/FrmAnswerScriptInitialPageView.aspx`;
const DEFAULT_URL = `${BASE_URL}${BASE_PATH}/LoginScreens/Default.aspx`;

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36',
  'Accept': '*/*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept-Encoding': 'gzip, deflate, br',
};

function extractHiddenFields(html: string) {
  const fields: Record<string, string> = {};
  
  const vsMatch = html.match(/id="__VIEWSTATE"[^>]*value="([^"]+)"/);
  if (vsMatch) fields['__VIEWSTATE'] = vsMatch[1];
  
  const vsgMatch = html.match(/id="__VIEWSTATEGENERATOR"[^>]*value="([^"]+)"/);
  if (vsgMatch) fields['__VIEWSTATEGENERATOR'] = vsgMatch[1];
  
  const evMatch = html.match(/id="__EVENTVALIDATION"[^>]*value="([^"]+)"/);
  if (evMatch) fields['__EVENTVALIDATION'] = evMatch[1];
  
  return fields;
}

interface Subject {
  code: string;
  name: string;
  asid: string;
  buttonName: string;
}

export async function POST(request: NextRequest) {
  const requestId = makeRequestId();
  try {
    const { cookies, courseValue } = await request.json();

    const jar = CookieJar.deserializeSync(cookies);
    const client = wrapper(axios.create({ jar }));

    // Get initial page
    const initialResp = await client.get(ANSWER_URL, {
      headers: { ...HEADERS, 'Referer': DEFAULT_URL }
    });

    const hiddenFields = extractHiddenFields(initialResp.data);
    const evalOptions = findSelectOptions(initialResp.data, 'DdlEvalLevel');
    const evalPick = pickNonPlaceholder(evalOptions, 'main') || pickNonPlaceholder(evalOptions);
    const evalLevel = evalPick?.value || evalPick?.label || 'Main Valuation';

    // Submit AJAX request to select course
    const formData = new URLSearchParams({
      ...hiddenFields,
      ctl00$Ajaxmastercontentplaceholder$DdlEvalLevel: evalLevel,
      ctl00$Ajaxmastercontentplaceholder$ddlexamname: courseValue,
      ctl00$Ajaxmastercontentplaceholder$TxtGoTo: '',
      ctl00$Ajaxmastercontentplaceholder$TxtGoTo0: '',
      ctl00$AjaxMstrScrpMngr: 'ctl00$Ajaxmastercontentplaceholder$UpdatepnlPrintStatus|ctl00$Ajaxmastercontentplaceholder$ddlexamname',
      __EVENTTARGET: '',
      __EVENTARGUMENT: '',
      __ASYNCPOST: 'true',
    });

    const ajaxResp = await client.post(ANSWER_URL, formData.toString(), {
      headers: {
        ...HEADERS,
        'Referer': ANSWER_URL,
        'X-MicrosoftAjax': 'Delta=true',
        'X-Requested-With': 'XMLHttpRequest',
        'Content-Type': 'application/x-www-form-urlencoded; charset=utf-8',
      },
    });

    // Extract subjects from response
    let tableMatch = ajaxResp.data.match(/id="ctl00_Ajaxmastercontentplaceholder_GVASIDDetails"[^>]*>([\s\S]*?)<\/table>/);
    if (!tableMatch) {
      tableMatch = ajaxResp.data.match(/<table[^>]*>([\s\S]*?)<\/table>/i);
    }
    if (!tableMatch) {
      return jsonError('E_SUBJECTS_PARSE', 'Could not find subjects table', 500, { requestId });
    }

    const tableHtml = tableMatch[1];
    const rows = tableHtml.match(/<tr[^>]*class="rowstyle"[^>]*>[\s\S]*?<\/tr>/g) || [];
    
    const subjects: Subject[] = [];
    for (const row of rows) {
      const cells = row.match(/<td[^>]*>([\s\S]*?)<\/td>/g) || [];
      if (cells.length >= 3) {
        const codeMatch = cells[0].match(/<span[^>]*>([^<]+)<\/span>/);
        const nameMatch = cells[1].match(/<span[^>]*>([^<]+)<\/span>/);
        const asidMatch = cells[2].match(/type="hidden"[^>]*value="([^"]*)"[^>]*>/);
        const btnMatch = cells[2].match(/type="image"[^>]*name="([^"]*)"/);
        
        if (codeMatch && nameMatch) {
          subjects.push({
            code: codeMatch[1].trim(),
            name: nameMatch[1].trim(),
            asid: asidMatch ? asidMatch[1] : '',
            buttonName: btnMatch ? btnMatch[1] : '',
          });
        }
      }
    }

    return jsonOk(
      {
        success: true,
        subjects,
        cookies: jar.serializeSync(),
        evalLevel,
      },
      requestId
    );

  } catch (error: any) {
    console.error(`Subjects error (${requestId}):`, error.message);
    return jsonError('E_SUBJECTS_FAILED', 'Failed to fetch subjects', 500, {
      detail: error.message,
      requestId,
    });
  }
}
