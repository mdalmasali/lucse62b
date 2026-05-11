import os
import re

html_files = []
for root, dirs, files in os.walk('.'):
    for f in files:
        if f.endswith('.html'):
            html_files.append(os.path.join(root, f))

def get_rel_path(filepath, target):
    is_pages = 'pages' in filepath.replace('\\', '/')
    if target == 'index.html':
        return '../index.html' if is_pages else 'index.html'
    else:
        # target is something like 'pages/students.html'
        if is_pages:
            return target.replace('pages/', '')
        else:
            return target

def generate_header(filepath):
    home = get_rel_path(filepath, 'index.html')
    students = get_rel_path(filepath, 'pages/students.html')
    classwork = get_rel_path(filepath, 'pages/classwork.html')
    info = get_rel_path(filepath, 'pages/info.html')
    resources = get_rel_path(filepath, 'pages/resources.html')
    results = get_rel_path(filepath, 'pages/result-dashboard.html')
    cover_page = get_rel_path(filepath, 'pages/cover-page.html')
    login = get_rel_path(filepath, 'pages/login.html')

    nav = f"""    <nav class="topbar fade-in">
      <a href="{home}" class="topbar-brand">CSE 62B · PORTAL</a>
      <ul class="topbar-links">
        <li><a href="{home}">Home</a></li>
        <li class="auth-only"><a href="{students}">Students</a></li>
        <li class="auth-only"><a href="{classwork}">Classwork</a></li>
        <li class="auth-only"><a href="{info}">Info</a></li>
        <li class="auth-only"><a href="{resources}">Resources</a></li>
        <li class="auth-only"><a href="{results}" style="color:var(--accent-bright);font-weight:600;"><i class="fa-solid fa-chart-line" style="font-size:0.85em;"></i> Results</a></li>
        <li><a href="{cover_page}" style="color:var(--accent-bright);font-weight:600;"><i class="fa-solid fa-file-pdf" style="font-size:0.85em;"></i> Cover Page</a></li>
        <li><a href="{login}" class="login-btn" id="navLoginBtn"><i class="fa-solid fa-right-to-bracket"></i> Login</a></li>
      </ul>
      <div class="topbar-status">
        <div class="status-dot"></div>
        Portal Active
      </div>
      <button class="hamburger" id="hamburger" aria-label="Open menu">
        <span></span><span></span><span></span>
      </button>
    </nav>
    <!-- Mobile Nav Overlay -->
    <div class="mobile-nav-overlay" id="mobileNav">
      <button class="mobile-nav-close" id="mobileNavClose">✕</button>
      <a href="{home}">Home</a>
      <a class="auth-only" href="{students}">Students</a>
      <a class="auth-only" href="{classwork}">Classwork</a>
      <a class="auth-only" href="{info}">Info</a>
      <a class="auth-only" href="{resources}">Resources</a>
      <a class="auth-only" href="{results}" style="color:var(--accent-bright);font-weight:600;"><i class="fa-solid fa-chart-line"></i> Results</a>
      <a href="{cover_page}" style="color:var(--accent-bright);font-weight:600;"><i class="fa-solid fa-file-pdf"></i> Cover Page</a>
      <a href="{login}" id="mobileLoginBtn"><i class="fa-solid fa-right-to-bracket"></i> Login</a>
    </div>"""
    return nav

def generate_footer(filepath):
    admin = get_rel_path(filepath, 'pages/admin.html')
    home = get_rel_path(filepath, 'index.html')
    students = get_rel_path(filepath, 'pages/students.html')
    info = get_rel_path(filepath, 'pages/info.html')
    
    footer = f"""    <footer>
      <div class="footer-brand">CSE 62B · PORTAL</div>
      <div class="footer-links">
        <a href="{home}">Home</a>
        <a href="{students}">Students Directory</a>
        <a href="{info}">Class Info</a>
        <a href="https://lus.ac.bd/" target="_blank">Leading University</a>
      </div>
      <div class="footer-note">
        Built with ❤️ for CSE Batch 62, Section B.<br>
        © 2026 MD. Almas Ali & MD. Shahriar Khan. All Rights Reserved.
      </div>
      <div style="margin-top: 10px;">
        <a href="{admin}" style="color: var(--accent2); text-decoration: none; font-size: 0.8rem; font-weight: 600; background: rgba(236,72,153,0.1); padding: 6px 14px; border-radius: 8px; border: 1px solid rgba(236,72,153,0.2);"><i class="fa-solid fa-lock"></i> Admin Portal</a>
      </div>
    </footer>"""
    return footer

for fpath in html_files:
    try:
        with open(fpath, 'r', encoding='utf-8') as f:
            content = f.read()

        # Remove existing topbar
        content = re.sub(r'<nav class="topbar.*?<\/nav>', '', content, flags=re.DOTALL)
        # Remove existing mobile nav
        content = re.sub(r'<!-- Mobile Nav Overlay -->.*?<\/div>', '', content, flags=re.DOTALL)
        # Remove existing footer
        content = re.sub(r'<footer.*?<\/footer>', '', content, flags=re.DOTALL)
        
        # We need to insert the new header right inside <div class="wrapper">
        header_html = generate_header(fpath)
        content = re.sub(r'(<div class="wrapper">)', r'\1\n' + header_html, content, count=1)
        
        # We need to insert the footer right before </div>\s*<script 
        footer_html = generate_footer(fpath)
        content = re.sub(r'(<\/div>\s*<script src=")', footer_html + r'\n  \1', content)
        # In case some files don't have <script src=" (like some inline scripts), let's just find the last </div> before </body>
        # Wait, the above regex might fail if the file doesn't match exactly.
        if footer_html not in content:
            # Let's insert before </body>
            # BUT the footer must be inside .wrapper!
            # Let's do this: find the last </div> before <script or </body> and insert it before that </div>? 
            # Actually, `</div>\s*<script` works for almost all of them, let's verify if we need a fallback.
            content = re.sub(r'(<\/div>\s*<script)', footer_html + r'\n  \1', content)
            
        with open(fpath, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f"Updated {fpath}")
    except Exception as e:
        print(f"Error updating {fpath}: {e}")
