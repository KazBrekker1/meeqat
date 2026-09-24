<template>
  <div class="min-h-screen overflow-y-auto bg-[#0a0e22] text-white">
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
        </ul>
      </section>

      <section class="space-y-2">
        <h2 class="text-lg font-semibold">If you sign in (optional)</h2>
        <p class="text-white/80">Sign-in uses your <b>Sanad</b> account (auth.sanad.ink), shared with other Sanad apps, with Google or a passkey. It holds your name, email and profile picture. Meeqat doesn't send your location, prayer times or settings to Sanad.</p>
      </section>

      <section class="space-y-2">
        <h2 class="text-lg font-semibold">Pray Together (coming soon)</h2>
        <p class="text-white/80">When it launches, it will store only: the rooms you join and your role, calls you start or join, and your votes. Chat messages are deleted one hour after each call. Your location is never stored; rooms that choose to be discoverable store a location rounded to about 100 metres.</p>
      </section>

      <p class="text-sm text-white/50">Questions? Open an issue on <a class="underline" href="https://github.com/KazBrekker1/meeqat/issues">GitHub</a>.</p>
    </main>
  </div>
</template>

<script setup lang="ts">
useHead({ title: "Privacy · Meeqat", htmlAttrs: { class: "dark" } });
</script>
