import { NextRequest } from 'next/server';
import axios from 'axios';
import { CookieJar } from 'tough-cookie';
import { wrapper } from 'axios-cookiejar-support';
import { jsonError, jsonOk, makeRequestId } from '../_utils';

const BASE_URL = 'https://aktuexams.in';
const BASE_PATH = '/AKTU';
const LOGIN_URL = `${BASE_URL}${BASE_PATH}/frmIntelliHomePage.aspx`;
const DEFAULT_URL = `${BASE_URL}${BASE_PATH}/LoginScreens/Default.aspx`;
const ANSWER_URL = `${BASE_URL}${BASE_PATH}/StudentServices/FrmAnswerScriptInitialPageView.aspx`;

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept-Encoding': 'gzip, deflate, br',
  'DNT': '1',
  'Connection': 'keep-alive',
  'Upgrade-Insecure-Requests': '1',
};

function extractHiddenFields(html: string) {
  const vsMatch = html.match(/id="__VIEWSTATE"[^>]*value="([^"]+)"/);
  const viewstate = vsMatch ? vsMatch[1] : '';
  
  const vsgMatch = html.match(/id="__VIEWSTATEGENERATOR"[^>]*value="([^"]+)"/);
  const viewstategen = vsgMatch ? vsgMatch[1] : '';
  
  const ppMatch = html.match(/id="__PREVIOUSPAGE"[^>]*value="([^"]+)"/);
  const prevpage = ppMatch ? ppMatch[1] : '';
  
  const evMatch = html.match(/id="__EVENTVALIDATION"[^>]*value="([^"]+)"/);
  const eventvalidation = evMatch ? evMatch[1] : '';
  
  const tkMatch = html.match(/id="ToolkitScriptManager1_HiddenField"[^>]*value="([^"]+)"/);
  const toolkit = tkMatch ? tkMatch[1] : ';AjaxControlToolkit, Version=3.5.60623.0, Culture=neutral, PublicKeyToken=28f01b0e84b6d53e:en-US:834c499a-b613-438c-a778-d32ab4976134:de1feab2:f2c8e708:720a52bf:f9cec9bc:589eaa30:a67c2700:8613aea7:3202a5a2:ab09e3fe:87104b7c:be6fb298';
  
  return { viewstate, viewstategen, prevpage, eventvalidation, toolkit };
}

function extractAjaxFields(text: string) {
  const fields: Record<string, string> = {};
  
  const vsMatch = text.match(/\|hiddenField\|__VIEWSTATE\|([^\|]+)/);
  if (vsMatch) fields['__VIEWSTATE'] = vsMatch[1];
  
  const evMatch = text.match(/\|hiddenField\|__EVENTVALIDATION\|([^\|]+)/);
  if (evMatch) fields['__EVENTVALIDATION'] = evMatch[1];
  
  const vsgMatch = text.match(/\|hiddenField\|__VIEWSTATEGENERATOR\|([^\|]+)/);
  if (vsgMatch) fields['__VIEWSTATEGENERATOR'] = vsgMatch[1];
  
  return fields;
}

export async function POST(request: NextRequest) {
  const requestId = makeRequestId();
  try {
    const { rollNo, password } = await request.json();

    const startedAt = Date.now();
    const log = (msg: string) => {
      const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
      console.log(`[login ${requestId} +${elapsed}s] ${msg}`);
    };

    const jar = new CookieJar();
    const client = wrapper(axios.create({ jar, timeout: 120000, maxRedirects: 5, validateStatus: () => true }));

    // Step 1: Get login page
    log('Fetching login page');
    const loginPage = await client.get(LOGIN_URL, { headers: HEADERS });
    log(`Login page status ${loginPage.status}`);
    if (loginPage.status !== 200) {
      return jsonError(
        'E_LOGIN_PAGE',
        'Login page not reachable',
        502,
        { detail: `status ${loginPage.status}`, requestId }
      );
    }
    const fields = extractHiddenFields(loginPage.data);

    // Step 2: Submit login
    const loginData = new URLSearchParams({
      ToolkitScriptManager1_HiddenField: fields.toolkit,
      __EVENTTARGET: '',
      __EVENTARGUMENT: '',
      __VIEWSTATE: fields.viewstate,
      __VIEWSTATEGENERATOR: fields.viewstategen,
      __PREVIOUSPAGE: fields.prevpage,
      __EVENTVALIDATION: fields.eventvalidation,
      txtUserID: rollNo,
      txtPasswrd: password,
      'IbtnEnter.x': '0',
      'IbtnEnter.y': '0',
      hdnCnfStatus: '',
    });

    log('Submitting login');
    const loginResponse = await client.post(LOGIN_URL, loginData.toString(), {
      headers: {
        ...HEADERS,
        'Referer': LOGIN_URL,
        'Origin': BASE_URL,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });
    log(`Login response status ${loginResponse.status}`);

    // Check for login error
    if (loginResponse.data.includes('Invalid User Id / Password') || 
        loginResponse.data.includes("alert('Invalid")) {
      return jsonError('E_LOGIN_INVALID', 'Invalid credentials', 401, { requestId });
    }

    // Step 3: Navigate to Default.aspx
    log('Fetching default page');
    const defaultResp = await client.get(DEFAULT_URL, {
      headers: { ...HEADERS, 'Referer': LOGIN_URL }
    });
    log(`Default page status ${defaultResp.status}`);
    if (defaultResp.status !== 200) {
      return jsonError(
        'E_LOGIN_REDIRECT',
        'Login redirect failed',
        502,
        { detail: `default status ${defaultResp.status}`, requestId }
      );
    }

    // Get session cookies
    const cookies = jar.serializeSync();
    
    return jsonOk(
      {
        success: true,
        cookies: cookies,
        message: 'Login successful',
      },
      requestId
    );

  } catch (error: any) {
    console.error(`Login error (${requestId}):`, error.message);
    const status = error?.code === 'ECONNABORTED' ? 504 : 500;
    return jsonError(
      error?.code === 'ECONNABORTED' ? 'E_LOGIN_TIMEOUT' : 'E_LOGIN_FAILED',
      'Login failed',
      status,
      { detail: error.message, requestId }
    );
  }
}
