import { NextRequest } from 'next/server';
import axios from 'axios';
import type { AxiosInstance } from 'axios';
import { CookieJar } from 'tough-cookie';
import { wrapper } from 'axios-cookiejar-support';
import { jsonError, jsonOk, makeRequestId } from '../_utils';
import { findSelectOptions, pickNonPlaceholder } from '../_parse';

function looksLikeLoginPage(html: string) {
  return typeof html === 'string' && html.includes('txtUserID') && html.includes('txtPasswrd');
}

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

async function fetchSubjectCount(client: AxiosInstance, courseValue: string, hiddenFields: Record<string, string>, evalLevel: string) {
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

  if (looksLikeLoginPage(ajaxResp.data)) {
    return 0;
  }

  let tableMatch = ajaxResp.data.match(/id="ctl00_Ajaxmastercontentplaceholder_GVASIDDetails"[^>]*>([\s\S]*?)<\/table>/);
  if (!tableMatch) {
    tableMatch = ajaxResp.data.match(/<table[^>]*>([\s\S]*?)<\/table>/i);
  }
  if (!tableMatch) {
    return 0;
  }

  const tableHtml = tableMatch[1];
  const rows = tableHtml.match(/<tr[^>]*class="rowstyle"[^>]*>[\s\S]*?<\/tr>/g) || [];
  return rows.length;
}

const BASE_URL = 'https://aktuexams.in';
const BASE_PATH = '/AKTU';
const ANSWER_URL = `${BASE_URL}${BASE_PATH}/StudentServices/FrmAnswerScriptInitialPageView.aspx`;
const DEFAULT_URL = `${BASE_URL}${BASE_PATH}/LoginScreens/Default.aspx`;

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept-Encoding': 'gzip, deflate, br',
};

interface Course {
  name: string;
  value: string;
}

export async function POST(request: NextRequest) {
  const requestId = makeRequestId();
  try {
    const { cookies } = await request.json();

    const jar = CookieJar.deserializeSync(cookies);
    const client = wrapper(axios.create({ jar }));

    const response = await client.get(ANSWER_URL, {
      headers: { ...HEADERS, 'Referer': DEFAULT_URL }
    });

    if (looksLikeLoginPage(response.data)) {
      return jsonError('E_LOGIN_INVALID', 'Invalid credentials', 401, {
        requestId,
        hint: 'Portal returned the login page when fetching courses.',
      });
    }

    // Extract course dropdown options
    const options = findSelectOptions(response.data, 'ddlexamname');
    if (!options.length) {
      return jsonError('E_COURSES_PARSE', 'Could not find course dropdown', 500, { requestId });
    }
    const courses: Course[] = [];
    for (const opt of options) {
      const name = opt.label.trim();
      const value = opt.value.trim();
      if (name && value && !name.toLowerCase().includes('select')) {
        courses.push({ name, value });
      }
    }

    const hiddenFields = extractHiddenFields(response.data);
    const evalOptions = findSelectOptions(response.data, 'DdlEvalLevel');
    const evalPick = pickNonPlaceholder(evalOptions, 'main') || pickNonPlaceholder(evalOptions);
    const evalLevel = evalPick?.value || evalPick?.label || 'Main Valuation';

    let filteredCourses = courses;
    if (courses.length > 1) {
      const validCourses: Course[] = [];
      for (const course of courses) {
        try {
          const count = await fetchSubjectCount(client, course.value, hiddenFields, evalLevel);
          if (count > 0) validCourses.push(course);
        } catch (err) {
          console.warn(`Course probe failed for ${course.value}:`, (err as Error).message);
        }
      }
      if (validCourses.length) {
        filteredCourses = validCourses;
      }
    }

    return jsonOk(
      {
        success: true,
        courses: filteredCourses,
        cookies: jar.serializeSync(),
      },
      requestId
    );

  } catch (error: any) {
    console.error(`Courses error (${requestId}):`, error.message);
    return jsonError('E_COURSES_FAILED', 'Failed to fetch courses', 500, {
      detail: error.message,
      requestId,
    });
  }
}
