"""Download attributed ClashKing assets; no runtime network dependency."""
import concurrent.futures, hashlib, json, pathlib, urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[1]
BASE = 'https://assets.clashk.ing/'
buildings = ['town_hall','gold_mine','elixir_collector','gold_storage','elixir_storage','barracks','army_camp','laboratory','spell_factory','cannon','archer_tower','mortar','wizard_tower','air_defense','wall',"builder's_hut"]
with urllib.request.urlopen('https://api.github.com/repos/ClashKingInc/ClashKingAssets/git/trees/main?recursive=1') as response:
    available = {entry['path'] for entry in json.load(response)['tree']}
paths = [f'buildings/home-village/{b}/level_{lv}.webp' for b in buildings for lv in range(1,11 if b == 'barracks' else 9)]
paths += [f'troops/{t}/icon.webp' for t in ['barbarian','archer','goblin','giant','wall_breaker','balloon','wizard','healer','dragon','pekka']]
paths += [f'resources/{r}.webp' for r in ['gold','elixir','gems','dark_elixir']]
paths += [f'obstacles/home-village/{o}.webp' for o in ['tree','bush','stone','trunk','gem_box']]
paths += ['obstacles/builder-base/big_tree.webp','obstacles/builder-base/tree.webp']
paths += [f'icons/Icon_HV_{i}.png' for i in ['Attack','Trophy','XP','Shield','Sword','Clan_War','Gold_Pass','Attack_Star']]
paths += ['fonts/SCmagic.ttf','sceneries/jungle_scenery/music.ogg',"helpers/builder's_apprentice.webp"]
paths += [f'spells/{s}_spell.webp' for s in ['lightning','healing','rage']]

def fetch(path):
    if 'assets/' + path not in available:
        return {'path': path, 'missing': True}
    target = ROOT / 'assets' / path
    target.parent.mkdir(parents=True, exist_ok=True)
    for attempt in range(3):
        try:
            if not target.exists():
                request = urllib.request.Request(BASE + urllib.parse.quote(path), headers={'User-Agent':'ClashVillage-local-demo'})
                with urllib.request.urlopen(request, timeout=35) as response:
                    target.write_bytes(response.read())
            return {'path': path, 'source': BASE + path, 'bytes': target.stat().st_size,
                    'sha256': hashlib.sha256(target.read_bytes()).hexdigest()}
        except Exception as error:
            if attempt == 2: return {'path': path, 'error': str(error)}

with concurrent.futures.ThreadPoolExecutor(max_workers=10) as pool:
    results = list(pool.map(fetch, paths))
(ROOT / 'assets/manifest.json').write_text(json.dumps(results, ensure_ascii=False, indent=2),encoding='utf-8')
print(json.dumps({'downloaded':sum('bytes' in r for r in results),'issues':[r for r in results if 'bytes' not in r]},ensure_ascii=False))
