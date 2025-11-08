# AKTU Answer Copy Downloader 📚


> A powerful Python tool to download answer scripts from the AKTU (Dr. A.P.J. Abdul Kalam Technical University) examination portal with marks breakdown tables included.

## 🌟 Features

- ✅ **Automated Login** - Securely login with roll number and password
- 📥 **Bulk Download** - Download all subjects at once or select specific ones
- 📊 **Marks Breakdown** - Automatically extracts and adds marks table as first page
- 📄 **PDF Generation** - Converts all pages into a single, organized PDF
- 🧹 **Auto Cleanup** - Removes temporary image files after PDF creation
- 🔧 **Modular Design** - Easy to modify for different courses or portal changes
- 🚀 **Open Source** - Free to use, modify, and contribute

---

## 📋 Table of Contents

- [Why This Tool?](#-why-this-tool)
- [How It Works](#-how-it-works)
- [Installation](#-installation)
- [Usage](#-usage)
- [Configuration](#-configuration)
- [Project Structure](#-project-structure)
- [Troubleshooting](#-troubleshooting)
- [Contributing](#-contributing)
- [License](#-license)
- [Disclaimer](#-disclaimer)

---

## 🤔 Why This Tool?

The AKTU examination portal allows students to view their answer scripts online, but:

1. **No Direct Download** - The portal doesn't provide a direct download option
2. **Manual Process** - Students have to manually screenshot or save each page
3. **Time Consuming** - Multiple subjects with multiple pages each = hours of work
4. **No Marks Table** - The marks breakdown table is separate and not included with pages
5. **Poor Organization** - Difficult to keep track of multiple subjects

**This tool solves all these problems!** It automates the entire process, downloads all pages, includes the marks table, and generates organized PDFs for each subject.

---

## 🔍 How It Works

### Technical Overview

The tool works by simulating a browser session and interacting with the AKTU portal:

```
┌─────────────────────────────────────────────────────────┐
│  1. AUTHENTICATION                                      │
│     • Fetches login page                               │
│     • Extracts hidden form fields (VIEWSTATE, etc.)    │
│     • Submits credentials via POST request             │
│     • Maintains session cookies                        │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│  2. COURSE SELECTION                                    │
│     • Navigates to answer script section               │
│     • Fetches available courses (BTECH, MBA, etc.)     │
│     • Selects course via AJAX request                  │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│  3. SUBJECT RETRIEVAL                                   │
│     • Parses HTML to extract subject list              │
│     • Displays subjects with codes and names           │
│     • User chooses: download all or select one         │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│  4. MARKS TABLE EXTRACTION                              │
│     • Scrapes marks breakdown table from HTML          │
│     • Converts table data to pandas DataFrame          │
│     • Generates styled table image using matplotlib    │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│  5. PAGE DOWNLOAD                                       │
│     • Extracts image URLs from response                │
│     • Downloads each page sequentially                 │
│     • Implements duplicate detection (MD5 hash)        │
│     • Respects rate limits with delays                 │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│  6. PDF GENERATION                                      │
│     • Inserts marks table as first page                │
│     • Combines all images into single PDF              │
│     • Deletes temporary image files                    │
│     • Saves final PDF with naming: RollNo_SubCode.pdf  │
└─────────────────────────────────────────────────────────┘
```

### Why Python & These Libraries?

- **requests** - HTTP client for making web requests and maintaining sessions
- **BeautifulSoup4** - HTML parser for extracting data from web pages
- **Pillow (PIL)** - Image processing for combining pages into PDF
- **pandas** - Data manipulation for marks table
- **matplotlib** - Generating visual table images

---

## 🚀 Installation

### Prerequisites

- Python 3.7 or higher
- pip (Python package manager)
- Internet connection

### Step-by-Step Installation

1. **Clone the repository**

```bash
git clone https://github.com/dydipanshu/AktuAnswerCopy.git
cd AktuAnswerCopy
```

2. **Install required dependencies**

```bash
pip install requests beautifulsoup4 Pillow pandas matplotlib
```

Or install them one by one:

```bash
pip install requests
pip install beautifulsoup4
pip install Pillow
pip install pandas
pip install matplotlib
```

**For Linux/Mac users** (if you face permission issues):

```bash
pip install --user requests beautifulsoup4 Pillow pandas matplotlib
```

**For Anaconda users**:

```bash
conda install requests beautifulsoup4 pillow pandas matplotlib
```

3. **Verify installation**

```bash
python --version  # Should show Python 3.7+
python -c "import requests; import bs4; import PIL; import pandas; import matplotlib; print('All dependencies installed!')"
```

---

## 💻 Usage

### Basic Usage

1. Navigate to the project directory:

```bash
cd AktuAnswerCopy
```

2. Run the script:

```bash
python aktu_downloader.py
```

3. Follow the prompts:

```
============================================================
AKTU Answer Script Downloader
============================================================

Roll number: 1234567890
Password: yourpassword

[Login process...]

Found 5 subject(s).
Download all subjects? (y/n): 
```

### Option 1: Download All Subjects

```
Download all subjects? (y/n): y

============================================================
Processing subject 1/5: CS101 - Data Structures
============================================================
Extracting marks breakdown table...
✓ Marks table extracted successfully
✓ Marks table image generated

Downloading (max 36 pages)...
Page 1 (245678 bytes)
Page 2 (234567 bytes)
...
Creating PDF...
✓ Marks table added to PDF
✓ PDF: 1234567890_CS101_pages/1234567890_CS101.pdf
Cleaning up image files...
✓ Image files cleaned up
✓ Completed: CS101

[Continues for all subjects...]
```

### Option 2: Download Specific Subject

```
Download all subjects? (y/n): n

Available subjects:
1. CS101 - Data Structures
2. CS102 - Algorithms
3. CS103 - Operating Systems
4. CS104 - Database Management
5. CS105 - Computer Networks

Select subject: 2
Selected: CS102

[Downloads only CS102...]
```

### Output Structure

After running the script, you'll have:

```
AktuAnswerCopy/
├── aktu_downloader.py
├── 1234567890_CS101_pages/
│   └── 1234567890_CS101.pdf    ← Your PDF with marks table
├── 1234567890_CS102_pages/
│   └── 1234567890_CS102.pdf
└── ...
```

**Note**: Image files are automatically deleted after PDF creation to save space.

---

## ⚙️ Configuration

### Modifying Settings

Open `aktu_downloader.py` and locate the `Config` class:

```python
class Config:
    """Configuration settings for the AKTU downloader."""
    
    # Portal URLs (modify these if the portal URL changes)
    BASE_URL = "https://aktuexams.in"
    BASE_PATH = "/AKTUSUMMER"
```

### Adding More Courses

To add support for MBA, MCA, or other courses:

```python
    # Available courses (add more courses here as needed)
    COURSES = {
        "BTECH": "BTECH",
        "MBA": "MBA",        # Add this line
        "MCA": "MCA",        # Add this line
        "MTECH": "MTECH",    # Add this line
    }
```

### Adjusting Download Settings

```python
    # Download settings
    MAX_PAGES = 36              # Maximum pages to download per subject
    PAGE_DELAY = 0.3            # Delay between downloads (seconds)
```

**Note**: Reducing `PAGE_DELAY` below 0.3 seconds may cause rate limiting issues.

---

## 📁 Project Structure

```
AktuAnswerCopy/
│
├── aktu_downloader.py          # Main script
│
├── README.md                   # This file
│
└── [Generated folders]         # Created after running
    ├── RollNo_SubjectCode_pages/
    │   └── RollNo_SubjectCode.pdf
    └── ...
```

### Code Architecture

The script is organized into modular classes:

| Class | Purpose |
|-------|---------|
| `Config` | Stores all configuration settings |
| `AKTUAuthenticator` | Handles login and authentication |
| `CourseSelector` | Manages course and subject selection |
| `MarksTableExtractor` | Extracts and generates marks table images |
| `PageDownloader` | Downloads answer script pages |
| `PDFGenerator` | Creates final PDF and cleans up files |
| `AKTUDownloader` | Main application orchestrator |

This modular design makes the code:
- ✅ Easy to maintain
- ✅ Simple to extend
- ✅ Straightforward to debug
- ✅ Ready for contributions

---

## 🐛 Troubleshooting

### Common Issues

#### 1. **Import Error: No module named 'X'**

**Solution**: Install the missing dependency

```bash
pip install [missing-module-name]
```

#### 2. **Login Failed / Authentication Error**

**Possible causes**:
- Incorrect roll number or password
- Portal is down or under maintenance
- Portal URL has changed

**Solution**: 
- Verify your credentials
- Check if the portal is accessible in a browser
- Update `BASE_URL` or `BASE_PATH` in the `Config` class if needed

#### 3. **No Subjects Found**

**Possible causes**:
- Results not yet published
- Account doesn't have access to answer scripts
- HTML structure of portal changed

**Solution**:
- Check portal manually in a browser
- If portal structure changed, the script may need updates

#### 4. **Pages Not Downloading**

**Possible causes**:
- Network issues
- Rate limiting by server
- Changed image URL patterns

**Solution**:
- Check your internet connection
- Increase `PAGE_DELAY` in Config
- Run the script again (it will skip duplicates)

#### 5. **PDF Generation Failed**

**Possible causes**:
- No pages were downloaded
- Insufficient disk space
- PIL/Pillow installation issue

**Solution**:
- Check if pages were downloaded to the folder
- Ensure you have enough disk space
- Reinstall Pillow: `pip uninstall Pillow && pip install Pillow`

#### 6. **Permission Denied Error**

**Solution** (Linux/Mac):

```bash
chmod +x aktu_downloader.py
python3 aktu_downloader.py
```

---

## 🤝 Contributing

Contributions are welcome! Here's how you can help:

### Ways to Contribute

1. **Report Bugs** - Open an issue describing the problem
2. **Suggest Features** - Share your ideas for improvements
3. **Fix Issues** - Submit pull requests with bug fixes
4. **Improve Documentation** - Help make the README better
5. **Add Support** - Extend functionality for other courses/portals

### Contribution Guidelines

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

### Code Style

- Follow PEP 8 guidelines
- Add docstrings to new functions/classes
- Keep functions modular and focused
- Comment complex logic

---

## 📜 License

This project is licensed under the MIT License - see below for details:

```
MIT License

Copyright (c) 2025 dydipanshu

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

## ⚠️ Disclaimer

**IMPORTANT: Please Read**

- This tool is created for **educational purposes** only
- It is designed to help students access their own answer scripts more conveniently
- **Use your own credentials only** - Never use someone else's login information
- Respect the AKTU portal's terms of service
- The author is not responsible for any misuse of this tool
- This is an unofficial tool and is not affiliated with AKTU
- Use at your own discretion and risk

**Ethical Usage**:
- ✅ Download your own answer scripts
- ✅ Use for personal reference and study
- ✅ Share the tool with fellow students
- ❌ Don't use others' credentials
- ❌ Don't overload the server with excessive requests
- ❌ Don't use for unauthorized access

---

## 🌟 Star This Repository

If you find this tool helpful, please consider giving it a ⭐ on GitHub! It helps others discover the project.

---

<div align="center">

**Made with ❤️ for AKTU Students**

[Report Bug](https://github.com/dydipanshu/AktuAnswerCopy/issues) · [Request Feature](https://github.com/dydipanshu/AktuAnswerCopy/issues) · [Contribute](https://github.com/dydipanshu/AktuAnswerCopy/pulls)

</div>