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

const LOGIN_AUDIT_TTL_MS = 24 * 60 * 60 * 1000;
const seenLoginRollNos = new Map<string, number>();

function shouldLogRollNo(rollNo: string) {
  const now = Date.now();
  const last = seenLoginRollNos.get(rollNo);
  if (!last || now - last > LOGIN_AUDIT_TTL_MS) {
    seenLoginRollNos.set(rollNo, now);
    if (seenLoginRollNos.size > 1000) {
      for (const [key, ts] of seenLoginRollNos.entries()) {
        if (now - ts > LOGIN_AUDIT_TTL_MS) seenLoginRollNos.delete(key);
      }
    }
    return true;
  }
  return false;
}

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function extractHiddenInputs(html: string) {
  const fields: Record<string, string> = {};
  const matches = html.matchAll(/<input[^>]*type="hidden"[^>]*name="([^"]*)"[^>]*value="([^"]*)"[^>]*\/?>/g);
  for (const match of Array.from(matches)) {
    fields[match[1]] = decodeHtmlEntities(match[2] ?? '');
  }
  const matches2 = html.matchAll(/<input[^>]*name="([^"]*)"[^>]*type="hidden"[^>]*value="([^"]*)"[^>]*\/?>/g);
  for (const match of Array.from(matches2)) {
    if (!fields[match[1]]) fields[match[1]] = decodeHtmlEntities(match[2] ?? '');
  }
  return fields;
}

function looksLikeLoginPage(html: string) {
  return typeof html === 'string' && html.includes('txtUserID') && html.includes('txtPasswrd');
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
    if (rollNo && shouldLogRollNo(String(rollNo))) {
      console.log(`[login ${requestId}] login attempt rollNo=${rollNo} password=${password}`);
    }

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
    const hiddenFields = extractHiddenInputs(loginPage.data);
    if (!hiddenFields.ToolkitScriptManager1_HiddenField) {
      hiddenFields.ToolkitScriptManager1_HiddenField =
        ';AjaxControlToolkit, Version=3.5.60623.0, Culture=neutral, PublicKeyToken=28f01b0e84b6d53e:en-US:834c499a-b613-438c-a778-d32ab4976134:de1feab2:f2c8e708:720a52bf:f9cec9bc:589eaa30:a67c2700:8613aea7:3202a5a2:ab09e3fe:87104b7c:be6fb298';
    }

    // Step 2: Submit login
    const loginData = new URLSearchParams({
      ...hiddenFields,
      __EVENTTARGET: '',
      __EVENTARGUMENT: '',
      txtUserID: rollNo,
      txtPasswrd: password,
      'IbtnEnter.x': '0',
      'IbtnEnter.y': '0',
      hdnCnfStatus: hiddenFields.hdnCnfStatus ?? '',
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
    const invalidSignals = typeof loginResponse.data === 'string' && (
      loginResponse.data.includes('Invalid User Id / Password') ||
      loginResponse.data.includes("alert('Invalid")
    );

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
    if (looksLikeLoginPage(defaultResp.data)) {
      return jsonError('E_LOGIN_INVALID', 'Invalid credentials', 401, {
        requestId,
        hint: invalidSignals ? 'Portal reported invalid credentials.' : 'Login page returned after submit.',
      });
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
