import axios from 'axios';
import { CookieJar } from 'tough-cookie';
import { wrapper } from 'axios-cookiejar-support';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const BASE_URL = 'https://aktuexams.in';
const BASE_PATH = '/AKTU';
const ANSWER_URL = `${BASE_URL}${BASE_PATH}/StudentServices/FrmAnswerScriptInitialPageView.aspx`;
const DEFAULT_URL = `${BASE_URL}${BASE_PATH}/LoginScreens/Default.aspx`;

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36',
  'Accept': '*/*',
  'Accept-Language': 'en-US,en;q=0.9',
};

function extractHiddenFields(html: string) {
  const fields: Record<string, string> = {};

  const hiddenMatches = html.matchAll(/<input[^>]*type="hidden"[^>]*name="([^"]*)"[^>]*id="([^"]*)"[^>]*value="([^"]*)"[^>]*\/?>/g);
  for (const match of Array.from(hiddenMatches)) {
    fields[match[1]] = match[3];
  }

  const hiddenMatches2 = html.matchAll(/<input[^>]*name="([^"]*)"[^>]*id="([^"]*)"[^>]*type="hidden"[^>]*value="([^"]*)"[^>]*\/?>/g);
  for (const match of Array.from(hiddenMatches2)) {
    if (!fields[match[1]]) fields[match[1]] = match[3];
  }

  return fields;
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

function stripTags(html: string) {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function extractMarksTable(html: string) {
  const tableMatch = html.match(/<table[^>]*id="ctl00_Ajaxmastercontentplaceholder_WebPanel1"[^>]*>([\s\S]*?)<\/table>/i);
  if (!tableMatch) return null;
  const tableHtml = tableMatch[1];
  const rowMatches = tableHtml.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) || [];
  const rows: string[][] = [];
  for (const row of rowMatches) {
    const cellMatches = row.match(/<t[dh][^>]*>[\s\S]*?<\/t[dh]>/gi) || [];
    const cells = cellMatches.map(c => decodeHtmlEntities(stripTags(c)));
    if (cells.length) rows.push(cells);
  }
  if (rows.length === 0) return null;

  let headers: string[] | null = null;
  let marks: string[] | null = null;

  for (const row of rows) {
    if (row.join(' ').toLowerCase().includes('q.num') || row.join(' ').toLowerCase().includes('q. num')) {
      headers = row;
    }
    if (row.join(' ').toLowerCase().includes('main valuation')) {
      marks = row;
    }
  }

  if (!headers && rows.length >= 2) {
    headers = rows[0];
    marks = rows[1];
  }

  if (!headers || !marks) return null;
  return { headers, marks };
}

async function addMarksTablePage(pdfDoc: PDFDocument, headers: string[], marks: string[]) {
  const page = pdfDoc.addPage([595, 842]);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const margin = 40;
  const titleSize = 16;
  const textSize = 10;
  const headerBg = rgb(1, 0.65, 0);
  const borderColor = rgb(0, 0, 0);

  page.drawText('Marks Breakdown', { x: margin, y: 800, size: titleSize, font: fontBold });

  const cols = headers.length;
  const tableWidth = 595 - margin * 2;
  const colWidth = tableWidth / cols;
  const rowHeight = 24;
  const startY = 760;

  const fitHeader = (text: string, maxWidth: number, maxLines = 2) => {
    const words = text.split(/\s+/).filter(Boolean);
    const lines: string[] = [];
    let current = '';
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (fontBold.widthOfTextAtSize(candidate, textSize) <= maxWidth || current.length === 0) {
        current = candidate;
      } else {
        lines.push(current);
        current = word;
      }
      if (lines.length === maxLines) break;
    }
    if (lines.length < maxLines && current) lines.push(current);
    let size = textSize;
    const widest = Math.max(...lines.map(l => fontBold.widthOfTextAtSize(l, size)), 0);
    if (widest > maxWidth) {
      size = Math.max(7, Math.floor((maxWidth / widest) * size));
    }
    return { lines, size };
  };

  const fitBody = (text: string, maxWidth: number, maxLines = 2) => {
    const words = text.split(/\s+/).filter(Boolean);
    const lines: string[] = [];
    let current = '';
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, textSize) <= maxWidth || current.length === 0) {
        current = candidate;
      } else {
        lines.push(current);
        current = word;
      }
      if (lines.length === maxLines) break;
    }
    if (lines.length < maxLines && current) lines.push(current);
    let size = textSize;
    const widest = Math.max(...lines.map(l => font.widthOfTextAtSize(l, size)), 0);
    if (widest > maxWidth) {
      size = Math.max(7, Math.floor((maxWidth / widest) * size));
    }
    return { lines, size };
  };

  for (let c = 0; c < cols; c++) {
    const x = margin + c * colWidth;
    const y = startY - rowHeight;
    page.drawRectangle({ x, y, width: colWidth, height: rowHeight, color: headerBg, borderColor, borderWidth: 1 });
    const text = headers[c] || '';
    const padding = 4;
    const maxWidth = colWidth - padding * 2;
    const fitted = fitHeader(text, maxWidth, 2);
    const lineHeight = fitted.size + 2;
    const totalHeight = fitted.lines.length * lineHeight;
    let textY = y + (rowHeight - totalHeight) / 2 + (fitted.lines.length - 1) * lineHeight;
    for (const line of fitted.lines) {
      page.drawText(line, { x: x + padding, y: textY, size: fitted.size, font: fontBold, color: rgb(0, 0, 0) });
      textY -= lineHeight;
    }
  }

  for (let c = 0; c < cols; c++) {
    const x = margin + c * colWidth;
    const y = startY - rowHeight * 2;
    page.drawRectangle({ x, y, width: colWidth, height: rowHeight, borderColor, borderWidth: 1 });
    const text = marks[c] || '';
    const padding = 4;
    const maxWidth = colWidth - padding * 2;
    const fitted = fitBody(text, maxWidth, 2);
    const lineHeight = fitted.size + 2;
    const totalHeight = fitted.lines.length * lineHeight;
    let textY = y + (rowHeight - totalHeight) / 2 + (fitted.lines.length - 1) * lineHeight;
    for (const line of fitted.lines) {
      page.drawText(line, { x: x + padding, y: textY, size: fitted.size, font, color: rgb(0, 0, 0) });
      textY -= lineHeight;
    }
  }
}

function extractAjaxFields(text: string) {
  const fields: Record<string, string> = {};

  const viewstate = text.match(/\|hiddenField\|__VIEWSTATE\|([^\|]+)/);
  if (viewstate) fields['__VIEWSTATE'] = viewstate[1];

  const eventvalidation = text.match(/\|hiddenField\|__EVENTVALIDATION\|([^\|]+)/);
  if (eventvalidation) fields['__EVENTVALIDATION'] = eventvalidation[1];

  const viewstategen = text.match(/\|hiddenField\|__VIEWSTATEGENERATOR\|([^\|]+)/);
  if (viewstategen) fields['__VIEWSTATEGENERATOR'] = viewstategen[1];

  return fields;
}

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function extractImgSrc(html: string) {
  const match = html.match(/id="ctl00_Ajaxmastercontentplaceholder_IMGAS"[^>]*src="([^"]*)"/);
  if (!match) return null;
  const src = decodeHtmlEntities(match[1]);
  if (!src || src.includes('load.gif')) return null;
  return src;
}

function extractHiddenValue(html: string, id: string) {
  const match = html.match(new RegExp(`id="${id}"[^>]*value="([^"]*)"`, 'i'));
  return match ? decodeHtmlEntities(match[1]) : '';
}

function extractTotalPages(html: string) {
  const total = extractHiddenValue(html, 'ctl00_Ajaxmastercontentplaceholder_txttotalpagecount');
  if (total && /^\d+$/.test(total)) return parseInt(total, 10);
  const lblMatch = html.match(/id="ctl00_Ajaxmastercontentplaceholder_lblnum\d?"[^>]*>(\d+)</);
  if (lblMatch) return parseInt(lblMatch[1], 10);
  return 0;
}

async function fetchImageBuffer(
  client: ReturnType<typeof wrapper>,
  imgPath: string,
  log?: (msg: string) => void
) {
  const imgUrl = new URL(imgPath, `${BASE_URL}${BASE_PATH}/StudentServices/`).href;
  const maxAttempts = 30;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const imgResp = await client.get(imgUrl, {
      headers: { ...HEADERS, 'Referer': ANSWER_URL },
      responseType: 'arraybuffer',
      validateStatus: () => true,
    });
    const contentType = (imgResp.headers['content-type'] as string | undefined) || '';
    if (imgResp.status === 200 && contentType.startsWith('image/')) {
      return { buffer: Buffer.from(imgResp.data), contentType };
    }
    if (attempt === 1 || attempt === maxAttempts) {
      log?.(`Image attempt ${attempt}/${maxAttempts} status=${imgResp.status} content-type=${contentType || 'unknown'}`);
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  return null;
}

async function requestWithRetry<T>(
  fn: () => Promise<T>,
  log: (msg: string) => void,
  label: string,
  maxAttempts = 5
) {
  let lastErr: any;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      lastErr = err;
      const code = err?.code || 'unknown';
      log(`${label} attempt ${attempt}/${maxAttempts} failed: ${code}`);
      await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
    }
  }
  throw lastErr;
}

export type DownloadParams = {
  cookies: any;
  courseValue: string;
  subject: { code: string; buttonName: string };
  evalLevel?: string;
  onProgress?: (update: { totalPages?: number; downloadedPages?: number; message?: string }) => void;
  log?: (msg: string) => void;
};

export async function downloadAnswerPdf({ cookies, courseValue, subject, evalLevel, onProgress, log = () => {} }: DownloadParams) {
  const jar = CookieJar.deserializeSync(cookies);
  const client = wrapper(axios.create({ jar, timeout: 120000 }));

  const initialResp = await requestWithRetry(
    () => client.get(ANSWER_URL, { headers: { ...HEADERS, 'Referer': DEFAULT_URL } }),
    log,
    'Initial page'
  );

  let hiddenFields = {
    ...extractHiddenInputs(initialResp.data),
    ...extractHiddenFields(initialResp.data),
  };

  const evalValue = evalLevel || 'Main Valuation';
  const courseForm = new URLSearchParams({
    ...hiddenFields,
    ctl00$Ajaxmastercontentplaceholder$DdlEvalLevel: evalValue,
    ctl00$Ajaxmastercontentplaceholder$ddlexamname: courseValue,
    ctl00$Ajaxmastercontentplaceholder$TxtGoTo: '',
    ctl00$Ajaxmastercontentplaceholder$TxtGoTo0: '',
    __LASTFOCUS: '',
    ctl00$AjaxMstrScrpMngr: 'ctl00$Ajaxmastercontentplaceholder$UpdatepnlPrintStatus|ctl00$Ajaxmastercontentplaceholder$ddlexamname',
    __EVENTTARGET: 'ctl00$Ajaxmastercontentplaceholder$ddlexamname',
    __EVENTARGUMENT: '',
    __ASYNCPOST: 'true',
  });

  const courseResp = await requestWithRetry(
    () => client.post(ANSWER_URL, courseForm.toString(), {
      headers: {
        ...HEADERS,
        'Referer': ANSWER_URL,
        'X-MicrosoftAjax': 'Delta=true',
        'X-Requested-With': 'XMLHttpRequest',
        'Content-Type': 'application/x-www-form-urlencoded; charset=utf-8',
      },
    }),
    log,
    'Course AJAX'
  );

  hiddenFields = {
    ...hiddenFields,
    ...extractHiddenInputs(courseResp.data),
    ...extractAjaxFields(courseResp.data),
  };

  const subjectForm = new URLSearchParams({
    ...hiddenFields,
    ctl00$Ajaxmastercontentplaceholder$DdlEvalLevel: evalValue,
    ctl00$Ajaxmastercontentplaceholder$ddlexamname: courseValue,
    ctl00$AjaxMstrScrpMngr: `ctl00$Ajaxmastercontentplaceholder$UpdatepnlPrintStatus|${subject.buttonName}`,
    __EVENTTARGET: '',
    __EVENTARGUMENT: '',
    __ASYNCPOST: 'true',
    [`${subject.buttonName}.x`]: '0',
    [`${subject.buttonName}.y`]: '0',
  });

  const subjectResp = await requestWithRetry(
    () => client.post(ANSWER_URL, subjectForm.toString(), {
      headers: {
        ...HEADERS,
        'Referer': ANSWER_URL,
        'X-MicrosoftAjax': 'Delta=true',
        'X-Requested-With': 'XMLHttpRequest',
        'Content-Type': 'application/x-www-form-urlencoded; charset=utf-8',
      },
    }),
    log,
    'Subject AJAX'
  );

  hiddenFields = {
    ...hiddenFields,
    ...extractHiddenInputs(subjectResp.data),
    ...extractAjaxFields(subjectResp.data),
  };

  const pages: { pageNum: number; buffer: Buffer; contentType?: string }[] = [];
  const marksTable = extractMarksTable(subjectResp.data);
  const inFlight: Promise<void>[] = [];
  const maxPages = 50;
  const totalPages = Math.min(extractTotalPages(subjectResp.data) || maxPages, maxPages);
  onProgress?.({ totalPages, message: `Detected ${totalPages} pages` });

  await new Promise(resolve => setTimeout(resolve, 2000));

  let lastImgPath = '';
  for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
    log(`Requesting page ${pageNum}/${totalPages}`);
    const pageForm = new URLSearchParams({
      ...hiddenFields,
      ctl00$Ajaxmastercontentplaceholder$DdlEvalLevel: evalValue,
      ctl00$Ajaxmastercontentplaceholder$ddlexamname: courseValue,
      ctl00$Ajaxmastercontentplaceholder$TxtGoTo: String(pageNum),
      ctl00$AjaxMstrScrpMngr: 'ctl00$Ajaxmastercontentplaceholder$UpdatepnlPrintStatus|ctl00$Ajaxmastercontentplaceholder$BtnGoTo',
      __EVENTTARGET: 'ctl00$Ajaxmastercontentplaceholder$BtnGoTo',
      __EVENTARGUMENT: '',
      __ASYNCPOST: 'true',
    });

    const pageResp = await requestWithRetry(
      () => client.post(ANSWER_URL, pageForm.toString(), {
        headers: {
          ...HEADERS,
          'Referer': ANSWER_URL,
          'X-MicrosoftAjax': 'Delta=true',
          'X-Requested-With': 'XMLHttpRequest',
          'Content-Type': 'application/x-www-form-urlencoded; charset=utf-8',
        },
      }),
      log,
      `Page ${pageNum} AJAX`
    );

    hiddenFields = {
      ...hiddenFields,
      ...extractHiddenInputs(pageResp.data),
      ...extractAjaxFields(pageResp.data),
    };

    let imgPath = extractImgSrc(pageResp.data);
    if (!imgPath) {
      const txtPath = extractHiddenValue(pageResp.data, 'ctl00_Ajaxmastercontentplaceholder_txtpath');
      if (txtPath) imgPath = txtPath;
    }
    if (imgPath && imgPath === lastImgPath) {
        const pageFormAlt = new URLSearchParams({
          ...hiddenFields,
          ctl00$Ajaxmastercontentplaceholder$DdlEvalLevel: evalValue,
        ctl00$Ajaxmastercontentplaceholder$ddlexamname: courseValue,
        ctl00$Ajaxmastercontentplaceholder$TxtGoTo0: String(pageNum),
        ctl00$AjaxMstrScrpMngr: 'ctl00$Ajaxmastercontentplaceholder$UpdatepnlPrintStatus|ctl00$Ajaxmastercontentplaceholder$BtnGoTo0',
        __EVENTTARGET: 'ctl00$Ajaxmastercontentplaceholder$BtnGoTo0',
        __EVENTARGUMENT: '',
        __ASYNCPOST: 'true',
      });
      const pageRespAlt = await requestWithRetry(
        () => client.post(ANSWER_URL, pageFormAlt.toString(), {
          headers: {
            ...HEADERS,
            'Referer': ANSWER_URL,
            'X-MicrosoftAjax': 'Delta=true',
            'X-Requested-With': 'XMLHttpRequest',
            'Content-Type': 'application/x-www-form-urlencoded; charset=utf-8',
          },
        }),
        log,
        `Page ${pageNum} AJAX (alt)`
      );
      hiddenFields = {
        ...hiddenFields,
        ...extractHiddenInputs(pageRespAlt.data),
        ...extractAjaxFields(pageRespAlt.data),
      };
      imgPath = extractImgSrc(pageRespAlt.data) || extractHiddenValue(pageRespAlt.data, 'ctl00_Ajaxmastercontentplaceholder_txtpath') || imgPath;
    }

    if (imgPath) {
      const fetchPromise = (async () => {
        const img = await fetchImageBuffer(client, imgPath, log);
        if (img?.buffer) {
          pages.push({ pageNum, ...img });
          onProgress?.({ downloadedPages: pages.length });
        }
      })();
      inFlight.push(fetchPromise);
      lastImgPath = imgPath;
    }

    await new Promise(resolve => setTimeout(resolve, 150));
  }

  await Promise.all(inFlight);

  if (pages.length === 0) {
    return { error: { code: 'E_DOWNLOAD_NO_PAGES', message: 'No pages downloaded.' } } as const;
  }

  const pdfDoc = await PDFDocument.create();

  if (marksTable?.headers && marksTable?.marks) {
    await addMarksTablePage(pdfDoc, marksTable.headers, marksTable.marks);
  }

  pages.sort((a, b) => a.pageNum - b.pageNum);
  for (const pageData of pages) {
    try {
      const contentType = pageData.contentType || '';
      const imgImage = contentType.includes('jpeg') || contentType.includes('jpg')
        ? await pdfDoc.embedJpg(pageData.buffer)
        : await pdfDoc.embedPng(pageData.buffer);
      const pdfPage = pdfDoc.addPage([imgImage.width, imgImage.height]);
      pdfPage.drawImage(imgImage, {
        x: 0,
        y: 0,
        width: imgImage.width,
        height: imgImage.height,
      });
    } catch {
      // skip invalid images
    }
  }

  const pdfBytes = await pdfDoc.save();
  const buffer = Buffer.from(pdfBytes);
  return {
    buffer,
    filename: `${subject.code}_${Date.now()}.pdf`,
    totalPages,
    downloadedPages: pages.length,
  } as const;
}
