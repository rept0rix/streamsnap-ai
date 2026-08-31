import urllib.request
import os

products = {
    "ac_milan_jersey.png": "https://images.puma.com/image/upload/f_auto,q_auto,b_rgb:080c14,w_600,h_600/global/770382/01/fnd/PNA/fmt/png/AC-Milan-23/24-Men's-Home-Authentic-Jersey",
    "angels_cap.png": "https://images.unsplash.com/photo-1588850561407-ed78c282e89b?auto=format&fit=crop&w=600&h=600&q=85",
    "white_tee.png": "https://images.unsplash.com/photo-1521572267360-ee0c2909d518?auto=format&fit=crop&w=600&h=600&q=85",
    "shure_sm7b.png": "https://images.unsplash.com/photo-1590602847861-f357a9332bbc?auto=format&fit=crop&w=600&h=600&q=85",
    "sony_headphones.png": "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=600&h=600&q=85",
    "elgato_light.png": "https://images.unsplash.com/photo-1517420704952-d9f39e95b43e?auto=format&fit=crop&w=600&h=600&q=85",
    "champion_hoodie.png": "https://images.unsplash.com/photo-1556905055-8f358a7a47b2?auto=format&fit=crop&w=600&h=600&q=85",
    "airpods_max.png": "https://images.unsplash.com/photo-1546435770-a3e426bf472b?auto=format&fit=crop&w=600&h=600&q=85",
    "stanley_tumbler.png": "https://images.unsplash.com/photo-1602143407151-7111542de6e8?auto=format&fit=crop&w=600&h=600&q=85",
    "bumper_plates.png": "https://images.unsplash.com/photo-1517838277536-f5f99be501cd?auto=format&fit=crop&w=600&h=600&q=85",
    "apple_watch.png": "https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=600&h=600&q=85",
    "elgato_deck.png": "https://images.unsplash.com/photo-1612287233207-6950294e3352?auto=format&fit=crop&w=600&h=600&q=85"
}

out_dir = "landing_page/assets/products"
os.makedirs(out_dir, exist_ok=True)

headers = {'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)'}

for fname, url in products.items():
    dest = os.path.join(out_dir, fname)
    try:
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, timeout=10) as response, open(dest, 'wb') as out_file:
            data = response.read()
            out_file.write(data)
        print(f"✓ Downloaded {fname} ({len(data)} bytes)")
    except Exception as e:
        print(f"✗ Failed {fname}: {e}")

