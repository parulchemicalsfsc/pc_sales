import requests, json
SUPABASE_URL = 'https://kscaczmstrudifqathfs.supabase.co'
SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtzY2Fjem1zdHJ1ZGlmcWF0aGZzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NzUwMjg3OCwiZXhwIjoyMDgzMDc4ODc4fQ.M9xsrkHchGolDcq5Fk-JTnK6wWAjyaGXENttT0doVJo'
headers = {'apikey': SUPABASE_KEY, 'Authorization': f'Bearer {SUPABASE_KEY}', 'Prefer': 'count=exact'}

# Total customers
resp = requests.get(f'{SUPABASE_URL}/rest/v1/customers', params={'select': 'count', 'limit': '0'}, headers=headers)
total = resp.headers.get('Content-Range', '').split('/')[-1]
print(f'Total customers: {total}')

# Distinct states (fetch all in batches)
all_locs = []
offset = 0
while True:
    r = requests.get(f'{SUPABASE_URL}/rest/v1/customers', 
        params={'select': 'state,district,taluka,village', 'limit': '1000', 'offset': str(offset)},
        headers={k: v for k, v in headers.items() if k != 'Prefer'})
    data = r.json()
    if not data:
        break
    all_locs.extend(data)
    if len(data) < 1000:
        break
    offset += 1000

print(f'Total location rows fetched: {len(all_locs)}')

states = set()
for row in all_locs:
    states.add(row.get('state') or 'NULL')
print(f'All distinct states: {sorted(states)}')

# Build hierarchy for GUJARAT
gujarat_districts = {}
for row in all_locs:
    if row.get('state') == 'GUJARAT':
        d = row.get('district') or 'NULL'
        t = row.get('taluka') or 'NULL'
        v = row.get('village') or 'NULL'
        if d not in gujarat_districts:
            gujarat_districts[d] = {}
        if t not in gujarat_districts[d]:
            gujarat_districts[d][t] = set()
        gujarat_districts[d][t].add(v)

print(f'\nGUJARAT districts: {sorted(gujarat_districts.keys())}')
if 'ANAND' in gujarat_districts:
    print(f'ANAND talukas: {sorted(gujarat_districts["ANAND"].keys())}')
    if 'BORSAD' in gujarat_districts['ANAND']:
        villages = sorted(gujarat_districts['ANAND']['BORSAD'])
        print(f'BORSAD villages: {len(villages)} -> {villages[:30]}')
    else:
        print('No BORSAD taluka found under ANAND')
        # Try case variations
        for t in gujarat_districts['ANAND']:
            if 'borsad' in t.lower():
                print(f'  Found similar: "{t}" with villages: {sorted(gujarat_districts["ANAND"][t])[:10]}')
else:
    print('No ANAND district found')
    for d in gujarat_districts:
        if 'anand' in d.lower():
            print(f'  Found similar: "{d}"')
