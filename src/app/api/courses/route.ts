import { NextRequest } from 'next/server';
import axios from 'axios';
import { CookieJar } from 'tough-cookie';
import { wrapper } from 'axios-cookiejar-support';
import { jsonError, jsonOk, makeRequestId } from '../_utils';
import { findSelectOptions } from '../_parse';

function looksLikeLoginPage(html: string) {
  return typeof html === 'string' && html.includes('txtUserID') && html.includes('txtPasswrd');
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

    return jsonOk(
      {
        success: true,
        courses,
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
