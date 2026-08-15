# Glimmerlings

Trwały, publicznie widoczny ekosystem cyfrowych istot. Każde stworzenie ma własną, małą sieć neuronową jako "mózg" — reguły przetrwania (szukanie jedzenia, unikanie głodu, rozmnażanie) nie są zaprogramowane na sztywno, tylko **wyewoluowane** przez pokolenia doboru naturalnego (neuroewolucja: wagi sieci = genom, mutowany przy każdej reprodukcji).

Świat żyje na serwerze 24/7, niezależnie od tego, czy ktoś w danym momencie patrzy. Każdy odwiedzający ogląda dokładnie tę samą, ciągłą symulację przez WebSocket — nie ma resetu po odświeżeniu strony.

## Jak to działa

- **Backend (`backend/`)** — Node.js. Trzyma cały stan świata w pamięci i tyka co ~120ms: stworzenia jedzą, tracą energię, rozmnażają się (mutacja genomu) albo umierają z głodu. Stan jest rozgłaszany przez WebSocket do wszystkich podłączonych widzów.
- **Frontend (`frontend/`)** — statyczny HTML/Canvas. Nie liczy niczego sam — tylko renderuje stan przychodzący z backendu. Serwowany bezpośrednio przez Node (Express).
- **Postgres** — co 30s zapisywany jest snapshot populacji (pozycje, energia, genomy). Restart kontenera/serwera wczytuje ostatni stan zamiast zaczynać od zera.
- **Cloudflare Tunnel** — wystawia backend na świat bez otwierania portów na routerze i bez ujawniania domowego adresu IP.

```
Przeglądarka widza ⇄ WebSocket ⇄ Node.js (symulacja + neuroewolucja) ⇄ Postgres (snapshoty)
```

## Uruchomienie lokalnie

```bash
cp .env.example .env
# ustaw POSTGRES_PASSWORD w .env
docker compose up --build
```

Otwórz `http://localhost:8080`.

## Wystawienie na świat (ThinkCentre)

1. W panelu Cloudflare Zero Trust: **Networks → Tunnels → Create a tunnel → Docker**. Skopiuj token.
2. Wklej token jako `CLOUDFLARE_TUNNEL_TOKEN` w `.env`.
3. W tunelu skonfiguruj *Public Hostname* wskazujący na `http://backend:8080` (nazwa usługi z `docker-compose.yml`).
4. Podłącz swoją domenę do tunelu w tym samym panelu.
5. `docker compose up -d` na ThinkCentre.

Populacja i tak żyje bez względu na liczbę widzów — koszt rośnie tylko przy rozgłaszaniu stanu, nie przy samej symulacji.

## Neuroewolucja w skrócie

- Wejścia sieci: kierunek/odległość do najbliższego jedzenia, poziom energii, kierunek/odległość do najbliższego innego stworzenia.
- Wyjścia: kierunek ruchu.
- Genom = spłaszczona tablica wag sieci. Rozmnażanie = kopia genomu rodzica + losowe mutacje wag.
- Selekcja naturalna: te genomy (czyli te "mózgi"), które skuteczniej znajdują jedzenie i unikają śmierci głodowej, zostawiają więcej potomstwa.

## Roadmap

- [ ] Wizualny styl pikselowy (kocie uszka, dymki nastroju) zamiast prostych kropek
- [ ] Krzyżowanie genomów dwóch rodziców, nie tylko mutacja asekualna
- [ ] Panel statystyk / wykres populacji w czasie
- [ ] Klikalne stworzenia z podglądem genomu (jak w prototypie z artefaktu)
- [ ] Rozważenie pełnego RL (PPO) jako alternatywnej ścieżki uczenia, po ustabilizowaniu neuroewolucji

## Licencja

MIT — zobacz [LICENSE](LICENSE).
