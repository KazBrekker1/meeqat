<template>
  <div class="h-full overflow-y-auto bg-[#0a0e22] text-white">
    <main class="mx-auto max-w-2xl px-5 py-10 space-y-8">
      <NuxtLink to="/" class="text-sm text-white/60 hover:text-white">← Back to Meeqat</NuxtLink>
      <header>
        <h1 class="text-2xl font-semibold">What Meeqat stores and sends</h1>
        <p class="mt-2 text-white/70">Meeqat has no ads, no analytics and no tracking. This page lists every place your data goes.</p>
      </header>

      <section class="space-y-2">
        <h2 class="text-lg font-semibold">On your device only</h2>
        <ul class="list-disc ps-5 space-y-1 text-white/80">
          <li>Your settings, favourite places and cached prayer times.</li>
          <li>Reminders are scheduled on your device, not on a server.</li>
        </ul>
      </section>

      <section class="space-y-2">
        <h2 class="text-lg font-semibold">Services Meeqat talks to</h2>
        <ul class="list-disc ps-5 space-y-1 text-white/80">
          <li><b>AlAdhan</b> (api.aladhan.com) calculates prayer times. It receives the city, or the coordinates you chose.</li>
          <li><b>"Use my location"</b>: your phone's location stays on the phone; on desktop, <b>GeoJS</b> (get.geojs.io) estimates a city from your IP address.</li>
          <li><b>Place search</b>: what you type goes to <b>Photon</b> (photon.komoot.io, OpenStreetMap). Naming a spot picked on the map uses <b>Nominatim</b> (OpenStreetMap).</li>
          <li><b>Maps</b> load tiles from <b>CARTO</b>.</li>
          <li><b>Updates</b> (apps only) are checked against Meeqat's GitHub releases.</li>
          <li><b>Add to calendar</b>: the link you copy or add contains your chosen coordinates (rounded to about 100 metres), calculation method and time zone. Your calendar app fetches it periodically from <b>together.sanad.ink</b> to keep prayer times up to date.</li>
        </ul>
      </section>

      <section class="space-y-2">
        <h2 class="text-lg font-semibold">If you sign in (optional)</h2>
        <p class="text-white/80">Sign-in uses your <b>Sanad</b> account (auth.sanad.ink), shared with other Sanad apps, with Google or a passkey. It holds your name, email and profile picture. Meeqat doesn't send your location, prayer times or settings to Sanad.</p>
      </section>

      <section class="space-y-2">
        <h2 class="text-lg font-semibold">Pray Together</h2>
        <p class="text-white/80">Rooms need a Sanad account. Using them stores, on <b>together.sanad.ink</b>:</p>
        <ul class="list-disc ps-5 space-y-1 text-white/80">
          <li>Your Sanad account ID and email (never shown to anyone), and your name and avatar, shown to other members of your rooms.</li>
          <li>The rooms you create or join, and your role and subscribe state in each.</li>
          <li>Calls you start or join: prayer, place, meeting time and who joined.</li>
          <li>Your poll votes.</li>
          <li>Chat messages — deleted one hour after each call ends.</li>
          <li>A one-line history entry per finished call (prayer, place and a headcount — not names).</li>
        </ul>
        <p class="text-white/80">In the desktop and Android apps, you sign in through your browser and the app keeps its Pray Together session on your device until you sign out.</p>
        <p class="text-white/80">Searching for nearby rooms sends your position with that one request; it's never stored. A room only stores a location if its owner turns on "discoverable", rounded to about 100 metres.</p>
      </section>

      <section class="space-y-2">
        <h2 class="text-lg font-semibold">Credits</h2>
        <p class="text-white/80">Moon imagery: NASA/LRO LROC (public domain), from NASA's Scientific Visualization Studio <a class="underline" href="https://svs.gsfc.nasa.gov/4720" target="_blank" rel="noopener">CGI Moon Kit</a>. It ships with Meeqat, so drawing the Moon contacts no other service.</p>
      </section>

      <p class="text-sm text-white/50">Questions? Open an issue on <a class="underline" href="https://github.com/KazBrekker1/meeqat/issues">GitHub</a>.</p>
    </main>
  </div>
</template>

<script setup lang="ts">
useHead({ title: "Privacy · Meeqat", htmlAttrs: { class: "dark" } });
</script>
