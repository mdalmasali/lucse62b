import os, re

SUPABASE_URL = 'https://ftvtlqxpalwvyserujuh.supabase.co/functions/v1/api-proxy'

def fix_file(filepath):
    if not os.path.exists(filepath): return
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    original = content
    
    # 1. Replace Promise based fetches that use template literals:
    # Pattern looks for Promise creation, script element creation, and appending to body
    pattern1 = r'return new Promise\(\(resolve, reject\) => \{[\s\S]*?const cb = `[^`]+`;[\s\S]*?const s\s*=\s*document\.createElement\(\'script\'\);[\s\S]*?s\.src = `([^`]+)`;[\s\S]*?document\.body\.appendChild\(s\);[\s\S]*?\}\);'

    def replacer1(match):
        src_expr = match.group(1)
        # extract sheet id var
        sheet_id_match = re.search(r'\$\{?([A-Za-z0-9_]+)\}?', src_expr.split('/gviz/')[0].split('/d/')[1])
        sheet_id_var = sheet_id_match.group(1) if sheet_id_match else 'SHEET_ID'
        
        # extract sheet name var
        sheet_name_match = re.search(r'sheet=\$\{encodeURIComponent\(([A-Za-z0-9_]+)\)\}', src_expr)
        sheet_name_var = sheet_name_match.group(1) if sheet_name_match else 'sheetName'
        
        if 'REDACTED' in sheet_id_var or sheet_id_var == 'SHEET_ID' or sheet_id_var == 'CPG_SHEET_ID':
             url_expr = f'`{SUPABASE_URL}?type=sheet&sheetName=${{encodeURIComponent({sheet_name_var})}}`'
        else:
             url_expr = f'`{SUPABASE_URL}?type=sheet&customSheetId=${{encodeURIComponent({sheet_id_var})}}&sheetName=${{encodeURIComponent({sheet_name_var})}}`'

        return f'''return fetch({url_expr})
        .then(res => {{ if (!res.ok) throw new Error('Network error'); return res.json(); }})
        .then(data => resolve(data))
        .catch(err => reject(err));'''

    content = re.sub(pattern1, replacer1, content)

    # 2. Replace Promise based fetches that use string concatenation instead of template literals:
    # like s.src = 'https://docs.google.com/spreadsheets/d/' + DL_SHEET_ID + '/gviz/tq?tqx=out:json;responseHandler:' + cb + '&sheet=' + encodeURIComponent(DL_SHEET_NAME);
    pattern2 = r'return new Promise\(\(resolve, reject\) => \{[\s\S]*?const cb = [^;]+;[\s\S]*?const s\s*=\s*document\.createElement\(\'script\'\);[\s\S]*?s\.src = \'https://docs.google.com/spreadsheets/d/\' \+ ([A-Za-z0-9_]+) \+ [^&]+&sheet=\' \+ encodeURIComponent\(([A-Za-z0-9_]+)\);[\s\S]*?document\.body\.appendChild\(s\);[\s\S]*?\}\);'

    def replacer2(match):
        sheet_id_var = match.group(1)
        sheet_name_var = match.group(2)
        
        url_expr = f'`{SUPABASE_URL}?type=sheet&customSheetId=${{encodeURIComponent({sheet_id_var})}}&sheetName=${{encodeURIComponent({sheet_name_var})}}`'
        return f'''return fetch({url_expr})
        .then(res => {{ if (!res.ok) throw new Error('Network error'); return res.json(); }})
        .then(data => resolve(data))
        .catch(err => reject(err));'''

    content = re.sub(pattern2, replacer2, content)
    
    # 3. Replace the direct export links
    # https://docs.google.com/spreadsheets/d/${id}/export?format=xlsx
    content = re.sub(
        r'`https://docs\.google\.com/spreadsheets/d/\$\{([A-Za-z0-9_]+)\}/export\?format=xlsx`',
        r'`https://docs.google.com/spreadsheets/d/${\1}/export?format=xlsx`', # Wait, the export link must go to Google directly because we don't proxy file downloads, we proxy JSON data. So leave export links as is.
        content
    )

    # exam.js has a special URL without &sheet= but with &headers=0
    pattern3 = r's\.src = `https://docs\.google\.com/spreadsheets/d/\$\{([^}]+)\}/gviz/tq\?tqx=out:json;responseHandler:\$\{cb\}&headers=0`;'
    def replacer3(match):
        sheet_id = match.group(1)
        return f"s.src = `{SUPABASE_URL}?type=sheet&customSheetId=${{encodeURIComponent({sheet_id})}}&sheetName=Form+Responses+1`; // Hardcoded sheet name for exam.js"
    
    content = re.sub(pattern3, replacer3, content)

    if content != original:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f'Fixed {filepath}')

base_dir = r'd:\62B Section\Website'
for root, dirs, files in os.walk(base_dir):
    for f in files:
        if f.endswith('.html') or f.endswith('.js'):
            fix_file(os.path.join(root, f))
print('Done!')
