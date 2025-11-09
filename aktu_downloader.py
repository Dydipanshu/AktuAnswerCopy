"""
AKTU Answer Script Downloader
==============================
An open-source tool to download answer scripts from AKTU portal.

Author: Deepanshu Yadav
License: MIT
Repository: https://github.com/Dydipanshu/AktuAnswerCopy
Version: 1.0.0

Usage:
    python aktu_downloader.py

Requirements:
    - requests
    - beautifulsoup4
    - Pillow
    - pandas
    - matplotlib
"""

import requests
from bs4 import BeautifulSoup
import os
import re
from urllib.parse import urljoin
import time
import hashlib
from PIL import Image
import pandas as pd
import matplotlib.pyplot as plt
from io import BytesIO
from typing import Dict, List, Tuple, Optional


# ============================================================================
# CONFIGURATION
# ============================================================================

class Config:
    """Configuration settings for the AKTU downloader."""
    
    # Portal URLs 
    BASE_URL = "https://aktuexams.in"
    BASE_PATH = "/AKTUSUMMER"
    
    # Available courses 
    COURSES = {
        "BTECH": "BTECH"
        
    }
    
    # Download settings
    MAX_PAGES = 36
    PAGE_DELAY = 0.3  # Delay between page downloads (seconds)
    
    # HTTP headers
    HEADERS = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:144.0) Gecko/20100101 Firefox/144.0",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
    }


# ============================================================================
# AUTHENTICATION MODULE
# ============================================================================

class AKTUAuthenticator:
    """Handles authentication with the AKTU portal."""
    
    def __init__(self, session: requests.Session, config: Config):
        self.session = session
        self.config = config
        self.login_url = f"{config.BASE_URL}{config.BASE_PATH}/frmIntelliHomePage.aspx"
    
    def login(self, roll_no: str, password: str) -> bool:
        """
        Authenticate user with roll number and password.
        
        Args:
            roll_no: Student roll number
            password: Student password
            
        Returns:
            True if login successful, False otherwise
        """
        print("Logging in...")
        
        # Get login page
        resp = self.session.get(self.login_url, headers=self.config.HEADERS)
        soup = BeautifulSoup(resp.text, 'html.parser')
        
        # Prepare login data
        login_data = self._prepare_login_data(soup, roll_no, password)
        
        # Submit login
        headers = self.config.HEADERS.copy()
        headers["Referer"] = self.login_url
        
        self.session.post(self.login_url, data=login_data, headers=headers)
        self.session.get(f"{self.config.BASE_URL}{self.config.BASE_PATH}/LoginScreens/Default.aspx", headers=headers)
        self.session.get(f"{self.config.BASE_URL}{self.config.BASE_PATH}/LoginScreens/frmMasterpageRedirect.aspx", headers=headers)
        
        print("✓ Login successful")
        return True
    
    def _prepare_login_data(self, soup: BeautifulSoup, roll_no: str, password: str) -> Dict:
        """Prepare login form data."""
        return {
            "ToolkitScriptManager1_HiddenField": ";AjaxControlToolkit, Version=3.5.60623.0, Culture=neutral, PublicKeyToken=28f01b0e84b6d53e:en-US:834c499a-b613-438c-a778-d32ab4976134:de1feab2:f2c8e708:720a52bf:f9cec9bc:589eaa30:a67c2700:8613aea7:3202a5a2:ab09e3fe:87104b7c:be6fb298",
            "__EVENTTARGET": "",
            "__EVENTARGUMENT": "",
            "__VIEWSTATE": soup.find('input', {'id': '__VIEWSTATE'})['value'],
            "__VIEWSTATEGENERATOR": soup.find('input', {'id': '__VIEWSTATEGENERATOR'})['value'],
            "__PREVIOUSPAGE": soup.find('input', {'id': '__PREVIOUSPAGE'})['value'],
            "__EVENTVALIDATION": soup.find('input', {'id': '__EVENTVALIDATION'})['value'],
            "txtUserID": roll_no,
            "txtPasswrd": password,
            "IbtnEnter.x": "34",
            "IbtnEnter.y": "7",
            "hdnCnfStatus": ""
        }


# ============================================================================
# COURSE SELECTION MODULE
# ============================================================================

class CourseSelector:
    """Handles course and subject selection."""
    
    def __init__(self, session: requests.Session, config: Config):
        self.session = session
        self.config = config
        self.answer_url = f"{config.BASE_URL}{config.BASE_PATH}/StudentServices/FrmAnswerScriptInitialPageView.aspx"
    
    def get_course_value(self, course_name: str) -> str:
        """
        Get the course value ID from the portal.
        
        Args:
            course_name: Name of the course (e.g., "BTECH")
            
        Returns:
            Course value ID
        """
        print(f"Finding '{course_name}'...")
        
        headers = self.config.HEADERS.copy()
        headers["Referer"] = f"{self.config.BASE_URL}{self.config.BASE_PATH}/LoginScreens/frmMasterpageRedirect.aspx"
        
        answer_resp = self.session.get(self.answer_url, headers=headers)
        soup = BeautifulSoup(answer_resp.text, 'html.parser')
        
        dropdown = soup.find('select', {'id': 'ctl00_Ajaxmastercontentplaceholder_ddlexamname'})
        option = dropdown.find('option', string=course_name)
        course_value = option['value']
        
        print(f"✓ Found: {course_value}")
        return course_value
    
    def select_course(self, course_value: str) -> requests.Response:
        """Select the course via AJAX."""
        print("Selecting course...")
        
        headers = self.config.HEADERS.copy()
        headers["Referer"] = f"{self.config.BASE_URL}{self.config.BASE_PATH}/LoginScreens/frmMasterpageRedirect.aspx"
        
        answer_resp = self.session.get(self.answer_url, headers=headers)
        soup = BeautifulSoup(answer_resp.text, 'html.parser')
        
        ajax_form = self._prepare_ajax_form(soup, course_value)
        ajax_headers = self._prepare_ajax_headers(headers)
        
        ajax_resp = self.session.post(self.answer_url, headers=ajax_headers, data=ajax_form)
        return ajax_resp
    
    def get_subjects(self, ajax_response: requests.Response) -> List[Dict]:
        """Extract available subjects from AJAX response."""
        soup = BeautifulSoup(ajax_response.text, 'html.parser')
        table = soup.find('table', {'id': 'ctl00_Ajaxmastercontentplaceholder_GVASIDDetails'})
        
        subjects = []
        for row in table.find_all('tr', class_='rowstyle'):
            cells = row.find_all('td')
            if len(cells) < 3:
                continue
            
            code = cells[0].find('span').text.strip()
            name = cells[1].find('span').text.strip()
            asid = cells[2].find('input', {'type': 'hidden'})['value']
            btn = cells[2].find('input', {'type': 'image'})['name']
            
            subjects.append({
                'code': code,
                'name': name,
                'asid': asid,
                'button': btn
            })
        
        return subjects
    
    def select_subject(self, ajax_response: requests.Response, subject: Dict, course_value: str) -> requests.Response:
        """Select a specific subject."""
        print(f"Loading subject: {subject['code']}...")
        
        soup = BeautifulSoup(ajax_response.text, 'html.parser')
        updated_fields = self._extract_fields(ajax_response.text)
        
        subj_form = {}
        for inp in soup.find_all('input', {'type': 'hidden'}):
            if inp.has_attr('name'):
                subj_form[inp['name']] = inp.get('value', '')
        
        subj_form.update(updated_fields)
        subj_form.update({
            'ctl00$Ajaxmastercontentplaceholder$DdlEvalLevel': 'Main Valuation',
            'ctl00$Ajaxmastercontentplaceholder$ddlexamname': course_value,
            'ctl00$AjaxMstrScrpMngr': f'ctl00$Ajaxmastercontentplaceholder$UpdatepnlPrintStatus|{subject["button"]}',
            '__EVENTTARGET': '',
            '__EVENTARGUMENT': '',
            '__ASYNCPOST': 'true',
            f'{subject["button"]}.x': '0',
            f'{subject["button"]}.y': '0'
        })
        
        ajax_headers = self._prepare_ajax_headers(self.config.HEADERS.copy())
        subj_resp = self.session.post(self.answer_url, headers=ajax_headers, data=subj_form)
        
        return subj_resp
    
    def _prepare_ajax_form(self, soup: BeautifulSoup, course_value: str) -> Dict:
        """Prepare AJAX form data."""
        ajax_form = {}
        for inp in soup.find_all('input', {'type': 'hidden'}):
            if inp.has_attr('name'):
                ajax_form[inp['name']] = inp.get('value', '')
        
        ajax_form.update({
            'ctl00$Ajaxmastercontentplaceholder$DdlEvalLevel': 'Main Valuation',
            'ctl00$Ajaxmastercontentplaceholder$ddlexamname': course_value,
            'ctl00$Ajaxmastercontentplaceholder$TxtGoTo': '',
            'ctl00$Ajaxmastercontentplaceholder$TxtGoTo0': '',
            'ctl00$AjaxMstrScrpMngr': 'ctl00$Ajaxmastercontentplaceholder$UpdatepnlPrintStatus|ctl00$Ajaxmastercontentplaceholder$ddlexamname',
            '__ASYNCPOST': 'true'
        })
        
        return ajax_form
    
    def _prepare_ajax_headers(self, base_headers: Dict) -> Dict:
        """Prepare headers for AJAX requests."""
        ajax_headers = base_headers.copy()
        ajax_headers.update({
            "Referer": self.answer_url,
            "X-MicrosoftAjax": "Delta=true",
            "X-Requested-With": "XMLHttpRequest",
            "Content-Type": "application/x-www-form-urlencoded; charset=utf-8",
            "Accept": "*/*",
        })
        return ajax_headers
    
    def _extract_fields(self, text: str) -> Dict:
        """Extract hidden form fields from AJAX response."""
        fields = {}
        patterns = [
            ('__VIEWSTATE', r'\|hiddenField\|__VIEWSTATE\|([^\|]+)'),
            ('__EVENTVALIDATION', r'\|hiddenField\|__EVENTVALIDATION\|([^\|]+)'),
            ('__VIEWSTATEGENERATOR', r'\|hiddenField\|__VIEWSTATEGENERATOR\|([^\|]+)')
        ]
        
        for field_name, pattern in patterns:
            m = re.search(pattern, text)
            if m:
                fields[field_name] = m.group(1)
        
        return fields


# ============================================================================
# MARKS TABLE MODULE
# ============================================================================

class MarksTableExtractor:
    """Extracts and generates marks breakdown table."""
    
    @staticmethod
    def extract_marks_data(response_text: str) -> Tuple[Optional[List], Optional[List]]:
        """Extract marks table headers and data."""
        soup = BeautifulSoup(response_text, 'html.parser')
        marks_table = soup.find('table', {'id': 'ctl00_Ajaxmastercontentplaceholder_WebPanel1'})
        
        if not marks_table:
            return None, None
        
        headers = []
        marks = []
        
        for row in marks_table.find_all('tr'):
            cells = row.find_all(['td', 'th'])
            row_data = [cell.get_text(strip=True) for cell in cells]
            
            if 'Q.Num' in ''.join(row_data):
                headers = row_data
            elif 'Main Valuation' in ''.join(row_data):
                marks = row_data
        
        return headers, marks
    
    @staticmethod
    def generate_table_image(headers: List, marks: List) -> Optional[Image.Image]:
        """Generate an image from marks table data."""
        if not headers or not marks:
            return None
        
        df = pd.DataFrame([marks], columns=headers)
        
        buffer = BytesIO()
        fig, ax = plt.subplots(figsize=(12, 4))
        ax.axis('tight')
        ax.axis('off')
        
        table = ax.table(cellText=df.values, colLabels=df.columns, 
                        cellLoc='center', loc='center')
        table.auto_set_font_size(False)
        table.set_fontsize(10)
        table.scale(1, 1.5)
        
        for cell in table.get_children():
            cell.set_edgecolor('black')
            cell.set_facecolor('#FFA500')
        
        plt.savefig(buffer, format='png', bbox_inches='tight', 
                   pad_inches=0.2, dpi=150)
        buffer.seek(0)
        plt.close()
        
        return Image.open(buffer)


# ============================================================================
# PAGE DOWNLOADER MODULE
# ============================================================================

class PageDownloader:
    """Handles downloading of answer script pages."""
    
    def __init__(self, session: requests.Session, config: Config):
        self.session = session
        self.config = config
        self.answer_url = f"{config.BASE_URL}{config.BASE_PATH}/StudentServices/FrmAnswerScriptInitialPageView.aspx"
        self.hashes = set()
    
    def download_pages(self, initial_response: requests.Response, course_value: str, 
                      output_dir: str) -> int:
        """
        Download all pages of the answer script.
        
        Returns:
            Number of pages downloaded
        """
        print(f"\nDownloading (max {self.config.MAX_PAGES} pages)...")
        os.makedirs(output_dir, exist_ok=True)
        
        # Download first page
        curr_fields = self._extract_fields(initial_response.text)
        if not self._download_single_page(initial_response.text, 1, output_dir):
            return 0
        
        page = 1
        curr_resp = initial_response
        
        # Download remaining pages
        while 'ctl00_Ajaxmastercontentplaceholder_Next' in curr_resp.text and page < self.config.MAX_PAGES:
            page += 1
            curr_resp = self._get_next_page(curr_resp.text, curr_fields, course_value)
            curr_fields = self._extract_fields(curr_resp.text)
            
            res = self._download_single_page(curr_resp.text, page, output_dir)
            if res == "dup":
                print("Duplicate detected")
                page -= 1
                break
            elif not res:
                break
            
            time.sleep(self.config.PAGE_DELAY)
        
        return page
    
    def _download_single_page(self, resp_text: str, page_num: int, output_dir: str) -> bool:
        """Download a single page."""
        m = re.search(r'id="ctl00_Ajaxmastercontentplaceholder_IMGAS".*?src="(.*?)"', resp_text)
        if not m:
            return False
        
        img_path = m.group(1)
        if img_path.startswith("../"):
            img_path = img_path.replace("../", "", 1)
        
        img_url = urljoin(f"{self.config.BASE_URL}{self.config.BASE_PATH}/StudentServices/", img_path)
        
        img_resp = self.session.get(img_url, headers={"Referer": self.answer_url})
        if img_resp.status_code != 200:
            return False
        
        h = hashlib.md5(img_resp.content).hexdigest()
        if h in self.hashes:
            return "dup"
        
        with open(f"{output_dir}/page_{page_num:02d}.png", "wb") as f:
            f.write(img_resp.content)
        
        self.hashes.add(h)
        print(f"Page {page_num} ({len(img_resp.content)} bytes)")
        return True
    
    def _get_next_page(self, resp_text: str, fields: Dict, course_value: str) -> requests.Response:
        """Navigate to the next page."""
        soup = BeautifulSoup(resp_text, 'html.parser')
        form = {}
        
        for inp in soup.find_all('input', {'type': 'hidden'}):
            if inp.has_attr('name'):
                form[inp['name']] = inp.get('value', '')
        
        if fields:
            form.update(fields)
        
        form.update({
            'ctl00$Ajaxmastercontentplaceholder$DdlEvalLevel': 'Main Valuation',
            'ctl00$Ajaxmastercontentplaceholder$ddlexamname': course_value,
            'ctl00$AjaxMstrScrpMngr': 'ctl00$Ajaxmastercontentplaceholder$UpdatepnlPrintStatus|ctl00$Ajaxmastercontentplaceholder$Next',
            '__EVENTTARGET': 'ctl00$Ajaxmastercontentplaceholder$Next',
            '__EVENTARGUMENT': '',
            '__ASYNCPOST': 'true'
        })
        
        for k in list(form.keys()):
            if '.x' in k or '.y' in k:
                del form[k]
        
        ajax_headers = self._prepare_ajax_headers()
        return self.session.post(self.answer_url, headers=ajax_headers, data=form)
    
    def _prepare_ajax_headers(self) -> Dict:
        """Prepare headers for AJAX requests."""
        ajax_headers = self.config.HEADERS.copy()
        ajax_headers.update({
            "Referer": self.answer_url,
            "X-MicrosoftAjax": "Delta=true",
            "X-Requested-With": "XMLHttpRequest",
            "Content-Type": "application/x-www-form-urlencoded; charset=utf-8",
            "Accept": "*/*",
        })
        return ajax_headers
    
    def _extract_fields(self, text: str) -> Dict:
        """Extract hidden form fields from response."""
        fields = {}
        patterns = [
            ('__VIEWSTATE', r'\|hiddenField\|__VIEWSTATE\|([^\|]+)'),
            ('__EVENTVALIDATION', r'\|hiddenField\|__EVENTVALIDATION\|([^\|]+)'),
            ('__VIEWSTATEGENERATOR', r'\|hiddenField\|__VIEWSTATEGENERATOR\|([^\|]+)')
        ]
        
        for field_name, pattern in patterns:
            m = re.search(pattern, text)
            if m:
                fields[field_name] = m.group(1)
        
        return fields


# ============================================================================
# PDF GENERATOR MODULE
# ============================================================================

class PDFGenerator:
    """Generates PDF from downloaded pages."""
    
    @staticmethod
    def create_pdf(output_dir: str, roll_no: str, subject_code: str, 
                   marks_table_image: Optional[Image.Image] = None) -> str:
        """
        Create PDF from downloaded pages and clean up image files.
        
        Returns:
            Path to generated PDF
        """
        print(f"\nCreating PDF...")
        
        files = sorted(
            [f for f in os.listdir(output_dir) if f.endswith(".png")],
            key=lambda x: int(x.split("_")[1].split(".")[0])
        )
        
        imgs = [Image.open(f"{output_dir}/{f}").convert("RGB") for f in files]
        
        # Add marks table as first page if available
        if marks_table_image:
            imgs.insert(0, marks_table_image.convert("RGB"))
            print("✓ Marks table added to PDF")
        
        pdf_path = None
        if imgs:
            pdf_path = f"{output_dir}/{roll_no}_{subject_code}.pdf"
            imgs[0].save(pdf_path, save_all=True, append_images=imgs[1:], resolution=200)
            print(f"✓ PDF: {pdf_path}")
            
            # Clean up image files after PDF creation
            print("Cleaning up image files...")
            for file in files:
                try:
                    os.remove(f"{output_dir}/{file}")
                except Exception as e:
                    print(f"Warning: Could not delete {file}: {e}")
            print("✓ Image files cleaned up")
        
        return pdf_path


# ============================================================================
# MAIN APPLICATION
# ============================================================================

class AKTUDownloader:
    """Main application class."""
    
    def __init__(self):
        self.config = Config()
        self.session = requests.Session()
    
    def run(self):
        """Run the main application."""
        print("=" * 60)
        print("AKTU Answer Script Downloader")
        print("=" * 60)
        
        # Get user input
        roll_no = input("\nRoll number: ").strip()
        password = input("Password: ").strip()
        
        # Authenticate
        auth = AKTUAuthenticator(self.session, self.config)
        auth.login(roll_no, password)
        
        # Select course
        course_name = self._select_course()
        selector = CourseSelector(self.session, self.config)
        course_value = selector.get_course_value(course_name)
        ajax_resp = selector.select_course(course_value)
        
        # Get subjects
        subjects = selector.get_subjects(ajax_resp)
        
        # Ask if user wants to download all subjects or select one
        download_all = self._ask_download_all(len(subjects))
        
        if download_all:
            self._download_all_subjects(subjects, selector, course_value, roll_no)
        else:
            subject = self._select_subject(subjects)
            self._download_single_subject(subject, selector, ajax_resp, course_value, roll_no)
        
        print("\n" + "=" * 60)
        print("Done!")
        print("Script by Deepanshu Yadav (dydipanshu)")
        print("=" * 60)
    
    def _ask_download_all(self, subject_count: int) -> bool:
        """Ask user if they want to download all subjects."""
        print(f"\nFound {subject_count} subject(s).")
        choice = input("Download all subjects? (y/n): ").strip().lower()
        return choice == 'y' or choice == 'yes'
    
    def _download_all_subjects(self, subjects: List[Dict], selector: CourseSelector, 
                               course_value: str, roll_no: str):
        """Download all available subjects."""
        print(f"\nDownloading all {len(subjects)} subjects...")
        
        for idx, subject in enumerate(subjects, 1):
            print("\n" + "=" * 60)
            print(f"Processing subject {idx}/{len(subjects)}: {subject['code']} - {subject['name']}")
            print("=" * 60)
            
            try:
                # Need to re-select course for each subject
                ajax_resp = selector.select_course(course_value)
                self._download_single_subject(subject, selector, ajax_resp, course_value, roll_no)
                print(f"✓ Completed: {subject['code']}")
            except Exception as e:
                print(f"✗ Error downloading {subject['code']}: {e}")
                print("Continuing with next subject...")
    
    def _download_single_subject(self, subject: Dict, selector: CourseSelector,
                                 ajax_resp: requests.Response, course_value: str, roll_no: str):
        """Download a single subject."""
        # Select subject
        subj_resp = selector.select_subject(ajax_resp, subject, course_value)
        
        # Extract marks table
        print("\nExtracting marks breakdown table...")
        extractor = MarksTableExtractor()
        headers, marks = extractor.extract_marks_data(subj_resp.text)
        
        marks_table_image = None
        if headers and marks:
            print("✓ Marks table extracted successfully")
            marks_table_image = extractor.generate_table_image(headers, marks)
            if marks_table_image:
                print("✓ Marks table image generated")
        else:
            print("⚠ Could not extract marks table, continuing without it...")
        
        # Download pages
        output_dir = f"{roll_no}_{subject['code']}_pages"
        downloader = PageDownloader(self.session, self.config)
        page_count = downloader.download_pages(subj_resp, course_value, output_dir)
        
        # Generate PDF
        generator = PDFGenerator()
        pdf_path = generator.create_pdf(output_dir, roll_no, subject['code'], marks_table_image)
    
    def _select_course(self) -> str:
        """Let user select a course."""
        print("\nAvailable courses:")
        courses = list(self.config.COURSES.keys())
        
        for i, course in enumerate(courses, 1):
            print(f"{i}. {course}")
        
        if len(courses) == 1:
            print(f"\nAuto-selecting: {courses[0]}")
            return courses[0]
        
        choice = int(input("\nSelect course: "))
        return courses[choice - 1]
    
    def _select_subject(self, subjects: List[Dict]) -> Dict:
        """Let user select a subject."""
        print("\nAvailable subjects:")
        
        for i, s in enumerate(subjects, 1):
            print(f"{i}. {s['code']} - {s['name']}")
        
        choice = int(input("\nSelect subject: "))
        selected = subjects[choice - 1]
        print(f"Selected: {selected['code']}")
        
        return selected


# ============================================================================
# ENTRY POINT
# ============================================================================

if __name__ == "__main__":
    try:
        app = AKTUDownloader()
        app.run()
    except KeyboardInterrupt:
        print("\n\nOperation cancelled by user.")
    except Exception as e:
        print(f"\n\nError: {e}")
        import traceback
        traceback.print_exc()
