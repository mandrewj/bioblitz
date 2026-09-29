# Deep links through the Wix embed (insectid.org/bioblitz)

Goal: share links like

    https://www.insectid.org/bioblitz?view=big-oaks-beetles

that open the Wix page with the iframe pointed at that project.

Wix does not forward its page's query string to an embedded iframe, so
a few lines of Velo (Wix's page code; free on every plan) do it.

## One-time Wix setup

1. In the Wix Editor, turn on **Dev Mode** (top bar → Dev Mode → Turn on
   Dev Mode). A code panel appears at the bottom of the page.
2. Click the embed element on the Bioblitz page. It must be an
   **Embed → Embed HTML** element set to **Website address** mode with
   `https://bioblitz-dashboard.vercel.app/` as the URL. In the
   properties panel, note its ID (e.g. `#html1`); rename it to
   `#bioblitzFrame` if you like.
3. Paste this into the page's code panel (adjust the element ID):

```js
import wixLocationFrontend from "wix-location-frontend";

const DASHBOARD = "https://bioblitz-dashboard.vercel.app";
const SLUG_RE = /^[a-z0-9-]+$/;

$w.onReady(function () {
  const frame = $w("#bioblitzFrame");

  // insectid.org/bioblitz?view=<slug>  →  iframe src
  const view = wixLocationFrontend.query.view;
  if (view && SLUG_RE.test(view)) {
    frame.src = `${DASHBOARD}/${view}`;
  }

  // Dashboard → Wix: keep ?view= in the address bar in sync when a
  // visitor switches projects inside the iframe, so copying the
  // browser URL gives a working deep link.
  frame.onMessage((event) => {
    const data = event.data;
    if (data && data.type === "bioblitz:view" && SLUG_RE.test(data.slug)) {
      wixLocationFrontend.queryParams.add({ view: data.slug });
    }
  });
});
```

4. Publish.

## Links

| Project | Link |
|---|---|
| Eagle Creek × Coleoptera | https://www.insectid.org/bioblitz?view=eagle-creek-beetles |
| Harmonie × Coleoptera | https://www.insectid.org/bioblitz?view=harmonie-beetles |
| Harmonie × Hymenoptera | https://www.insectid.org/bioblitz?view=harmonie-hymenoptera |
| Big Oaks × Coleoptera | https://www.insectid.org/bioblitz?view=big-oaks-beetles |

A new view's link is just `?view=<slug>` — no Wix change needed.

## How the dashboard side works

`components/dashboard.tsx` posts `{ type: "bioblitz:view", slug }` to
`window.parent` whenever the view changes while iframed. It's a no-op
when the dashboard is opened directly.
