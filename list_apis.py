import json
cfg = json.load(open('config/config.json'))
apis = cfg.get('apis', {})
# Categorize by URL pattern
bssf, rmca, cpm, catalog, other = [], [], [], [], []
for k, v in sorted(apis.items()):
    url = v.get('url', '')
    method = v.get('method', '')
    if 'ROOT_RMCA_CATALOG' in url or 'catalog' in k:
        catalog.append((k, method, url))
    elif 'ROOT_CPM' in url or 'cpm' in k:
        cpm.append((k, method, url))
    elif 'ROOT_RMCA' in url and 'catalog' not in k:
        rmca.append((k, method, url))
    elif 'ROOT_BAE' in url or 'bssf' in url.lower():
        bssf.append((k, method, url))
    else:
        other.append((k, method, url))

print(f"=== BSSF APIs ({len(bssf)}) ===")
for k, m, u in bssf:
    print(f"  {m:6s} {k}")
print(f"\n=== RMCA APIs ({len(rmca)}) ===")
for k, m, u in rmca:
    print(f"  {m:6s} {k}")
print(f"\n=== CPM APIs ({len(cpm)}) ===")
for k, m, u in cpm:
    print(f"  {m:6s} {k}")
print(f"\n=== Catalog APIs ({len(catalog)}) ===")
for k, m, u in catalog:
    print(f"  {m:6s} {k}")
print(f"\n=== Other ({len(other)}) ===")
for k, m, u in other:
    print(f"  {m:6s} {k}")
