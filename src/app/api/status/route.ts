import { NextResponse } from 'next/server';
import axios from 'axios';
import { jsonError, jsonOk, makeRequestId } from '../_utils';

const BASE_URL = 'https://aktuexams.in';
const BASE_PATH = '/AKTU';
const LOGIN_URL = `${BASE_URL}${BASE_PATH}/frmIntelliHomePage.aspx`;

export async function GET() {
  const requestId = makeRequestId();
  try {
    const startedAt = Date.now();
    await axios.get(LOGIN_URL, {
      timeout: 25000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });
    const ms = Date.now() - startedAt;
    return jsonOk({ ms }, requestId);
  } catch (error: any) {
    const code = error?.code;
    if (code === 'ECONNABORTED') {
      return jsonError('E_STATUS_SLOW', 'AKTU portal is responding very slowly', 504, {
        requestId,
      });
    }
    return jsonError('E_STATUS_DOWN', 'AKTU portal appears down', 503, { requestId });
  }
}
