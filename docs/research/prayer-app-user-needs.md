# What prayer-app users ask for, praise, and complain about

Research for Meeqat's feature roadmap and the proposed optional Sanad sign-in/sync. Evidence gathered via web search and direct page fetches in September 2026. Where a page could not be fully loaded (Play Store listings blocked full fetch), findings rely on search-result snippets — flagged inline. No quote or URL below was fabricated; anything I could not verify is marked as such.

## 1. Summary — strongest findings

1. **Ads are the #1 visceral complaint** on the biggest free apps, described as blocking core content (recurring across 3+ sources: Play Store snippet for Muslim Pro, justuseapp aggregation, Al Jazeera coverage of the trust fallout).
2. **The 2020 Muslim Pro/X-Mode location-data sale is the industry's defining trust event** and still shapes what users say they want from a "religious" app (recurring across Vice/Motherboard, Middle East Eye, Muslim Pro's own statement).
3. **Users want widgets, and paywalling widgets triggers backlash** — IslamicFinder's Athan app moved widgets behind a subscription and drew explicit complaints (recurring: Play Store snippet + justuseapp).
4. **Prayer-time accuracy disputes are usually a calculation-method mismatch, not a bug** — Fajr/Isha angle differences (e.g., ISNA 15° vs. local mosque 18°) routinely produce 15-minute "wrong time" reports (GitHub: AlmutazYounes/PrayerAthan #4; batoulapps high-latitude issue #25).
5. **Adhan notifications silently stop firing** due to two platform-specific ceilings: Android background/battery-optimization kills, and iOS's 64-pending-local-notification cap, both acknowledged directly by developers (Muslim Pro help center articles; athkar GitHub issue #5).
6. **Hijri date "off by a day" is a recurring support topic**, and the accepted fix industry-wide is a manual adjustment control, not a "correct" answer (Muslim Pro help center; Five Prayers, Ramadan Calendar app listings).
7. **Prayer tracking/streaks is now a mainstream expected feature**, not a niche one — Pillars, Just Pray, Muslim App/Muslim Assistant, and multiple qada-tracker apps all ship it, several with menstruation-aware pause logic (recurring across 4 app listings).
8. **Iqama (congregation) times and mosque-specific schedules are a distinct, unmet need from calculated prayer times** — Mawaqit's entire pitch is showing the imam's actual iqama time instead of an algorithm's estimate (Mawaqit App Store listing).
9. **One-time purchase / donation-supported / fully-open-source are the pricing models users react well to**; subscription-only models draw pushback even on well-liked apps (Muslim App/Muslim Assistant reviews snippet; Pillars and Al-Azan positioning).
10. **Privacy-conscious users explicitly want offline capability, no trackers, and open source** as a category, evidenced by dedicated apps built around that pitch (Al-Azan/meypod, Vakti) rather than as a checkbox in a mainstream app.
11. **DST and timezone handling is a recurring, structurally-caused bug class** — computing in UTC with a fixed offset instead of an IANA timezone breaks every DST transition (Muslim Pro help center article on DST; general dev community discussion).
12. **Live Activities / lock-screen widgets have gone from feature request to competitive baseline on iOS** in the last two years (Athan Pro, Muslim Pro, Prayer Times with Widgets all shipped them; Muslim Tech Wire coverage).

## 2. Top complaints

- **Ads / paywalls blocking core function.** Snippet-level evidence (direct fetch of the Play listing returned truncated content) describes ads "in circles that cover prayer times with no way to close them," users "flooded with ads ... unless they pay expensive subscription fees," and objectionable ad content appearing "before being able to see prayer times." Source: https://play.google.com/store/apps/details?id=com.bitsmedia.android.muslimpro&hl=en_US. IslamicFinder's Athan app moved its widget behind a paid tier, drawing complaints that a previously standard feature became premium. Source (snippet): https://play.google.com/store/apps/details?id=com.athan&hl=en.

- **Privacy / data selling.** In November 2020 Vice's Motherboard reported Muslim Pro (98M+ downloads) was sending granular location data — including current wifi network name, timestamp, and device model — to data broker X-Mode, which sold it on to defense contractors and ultimately the U.S. military; the partnership was not disclosed in Muslim Pro's privacy policy. Source: https://www.vice.com/en/article/g5bq89/muslim-pro-location-data-military-xmode. Muslim Pro's own response: "Muslim Pro did not give your data to the US military. We've never done that, and never will," while confirming anonymized data had been shared with X-Mode and announcing it was "immediately terminating our relationships with our data partners." Source: https://support.muslimpro.com/hc/en-us/articles/360052648551-Statement-from-Muslim-Pro. Al Jazeera also reported the company calling the "sold to the military" framing "untrue": https://www.aljazeera.com/amp/news/2020/11/18/muslim-pro-app-denies-selling-user-data-to-us-military. Middle East Eye documented user backlash: https://www.middleeasteye.net/news/us-military-data-muslim-pro-app-denounced.

- **Accuracy & calculation-method / high-latitude issues.** A GitHub issue on the batoulapps/Adhan family of libraries questions whether fixed Fajr/Isha degree angles hold at high/low latitudes, prompting library support for automatic high-latitude rules (e.g., the 1/7 rule above 55°). Source: https://github.com/batoulapps/adhan-kotlin/issues/25. A real-world "wrong prayer time" bug report was diagnosed as a calculation-method mismatch (ISNA 15° vs. an 18°-based mosque table), not a code defect. Source: https://github.com/AlmutazYounes/PrayerAthan/issues/4.

- **Notifications/adhan not firing.** Android: aggressive OEM battery optimization (Nokia, OnePlus, Xiaomi flagged specifically) kills background services so adhan alerts silently stop; the fix is a per-app "don't optimize" exemption rather than disabling optimization globally (general, not prayer-app-specific source: https://lifetips.alibaba.com/tech-efficiency/android-battery-optimization-truth-vs-background-app-kill — no prayer-app-specific Reddit thread was found despite multiple attempts, a gap). Muslim Pro has a dedicated help article for it: https://support.muslimpro.com/hc/en-us/articles/360040773471-Android-Battery-Settings-for-Muslim-Pro-app. iOS: local notifications cap at 64 pending; developers work around it by re-scheduling ~10 days of prayer notifications on every launch, since prayer times shift daily and can't use recurring alarms. Source: https://github.com/t1nk333r/athkar/issues/5. Muslim Pro maintains three separate help articles for adhan/notification failures, itself evidence of frequency: https://support.muslimpro.com/hc/en-us/articles/200588785-The-app-is-not-playing-the-full-Adhan-iOS-Android, https://support.muslimpro.com/hc/en-us/articles/200664340-The-Adhan-notifications-have-stopped-working-after-a-few-days-iOS-only, https://support.muslimpro.com/hc/en-us/articles/200585195-The-adhan-notifications-are-not-working-iOS.

- **App bloat / battery drain.** Muslim Pro's support docs acknowledge users worry the app drains battery, attributed to the background presence needed for adhan. Source: https://support.muslimpro.com/hc/en-us/articles/360040773471-Android-Battery-Settings-for-Muslim-Pro-app. No prayer-app-specific quantified complaints were found beyond this — flagged as a gap.

- **Widget problems.** No prayer-app-specific primary complaint thread was found despite multiple search attempts — flagged as a gap.

- **Timezone/DST/travel bugs.** Muslim Pro maintains a dedicated help article, "prayer times seem to be one hour off — Daylight Saving Time," confirming recurring support load. Source: https://support.muslimpro.com/hc/en-us/articles/211664267-The-prayer-times-seem-to-be-one-hour-off-Daylight-Saving-Time-DST. The structural root cause — computing in UTC with a fixed offset instead of an IANA timezone, which breaks every DST transition — is described in general developer discussion (supporting context, not a user complaint): https://dev.to/wesalna/why-two-prayer-time-apps-disagree-by-one-or-two-minutes-15df.

- **Hijri date offset.** Muslim Pro's help center documents "How to Adjust Islamic (Hijri) Calendar Date," a known, recurring point of confusion tied to moon-sighting differences between countries. Source: https://support.muslimpro.com/hc/en-us/articles/360042545591-How-to-Adjust-Islamic-Hijri-Calendar-Date. Other apps (Five Prayers, Hijri Calendar & Prayer Times, Ramadan Calendar) independently ship the same manual +/-1-2 day adjustment per their store descriptions (snippet-level, corroborating only).

## 3. Most-requested features

- **Prayer tracking / qada log & streaks — high frequency.** Standard across Pillars (streak lock-screen widget, "menstruation pause" so streaks aren't broken during valid exemptions), Just Pray (family sharing, per-person streaks, "Garden of Deeds"), Muslim App/Muslim Assistant ("Prayer Tracker to mark daily salah"), plus dedicated qada-counter apps (Qadaa Tracker, Salah Journal, Qadha Prayer Counter). Sources: https://www.thepillarsapp.com/, https://justprayapp.co/blog/best-muslim-apps-families-kids, https://apps.apple.com/us/app/muslim-assistant-salah-qibla/id1137963102.
- **Per-prayer adhan choice & custom sounds — moderate-high.** Muslim App/Muslim Assistant advertises "a maqam-based default Adhan plus options like the one commonly heard in your country" and per-time-of-day sound customization. Same listing as above.
- **Iqama times per mosque / mosque finder & Jumu'ah info — high, distinct need.** Mawaqit's whole pitch is "the precise timetables set by your Imam" rather than a calculated estimate; Athan+ (Masjidal) lets users find nearby masjids and see iqama times, announcements, donation links; Masjidi claims to be "the first application to support Iqamah times." Sources: https://apps.apple.com/us/app/mawaqit-prayer-times-mosque/id1460522683, https://mymasjidal.com/pages/athanplus, https://www.masjidiapp.com/.
- **Per-prayer minute adjustments — implied standard.** Ramadan 2026's listing advertises "adjustable timetables by adding or removing minutes" for Suhoor/Iftar, mirroring the common per-prayer manual-adjustment pattern industry-wide (snippet-level, not independently fetched).
- **Manual Hijri date adjustment — high**, see complaints section (Muslim Pro help article + competing apps shipping the same control).
- **Ramadan mode (suhoor/iftar countdown, taraweeh tracking) — high, seasonal.** Open-source project tryramadan explicitly supports "quick-add options for Suhoor, Iftar, all prayers, Taraweeh, and custom events." Source: https://github.com/ummahbuild/tryramadan. Commercial apps (Ramadan Countdown, Iftar: Countdown Ramadan) ship the same countdown pattern per their listings (snippet-level).
- **Fasting tracker — moderate.** Muslim Pro's lock-screen widget lists a "fasting tracker" among surfaced features (snippet from https://www.muslimpro.com/updated-muslim-pro-widgets-for-ios/, not fully fetched).
- **Silent/DND automation during prayer — thin evidence.** One dedicated app, "Prayer Pause: Screen Time," focuses on screen-time/DND during prayer windows. Source: https://apps.apple.com/us/app/prayer-pause-screen-time/id6757287456 (single-source, low confidence).
- **Wearables (Wear OS / watch complications) — real but niche.** Dedicated apps exist for prayer times and tasbih on Wear OS ("Tasbih for Wear OS", "Qibla Finder and Salah Wear OS"); Tasbih Counter (iOS) advertises Apple Watch support. Sources: https://play.google.com/store/apps/details?id=app.islamhub.tasbihforwearos&hl=en_US, https://apps.apple.com/us/app/tasbih-counter-dhikr-azkar/id1190450937.
- **Lock-screen widgets / iOS Live Activities — competitive baseline, high frequency.** Athan Pro ships two Live Activity layouts (full-day timeline, next-prayer countdown) for Lock Screen and Dynamic Island; Muslim Pro shipped a lock-screen widget bundling next-prayer time, Qibla, Quran access, fasting tracker. Sources: https://www.muslimtechwire.com/athan-pro-live-activities, https://support.muslimpro.com/hc/en-us/articles/32699302823193-Lockscreen-Updated-Widget-iOS.
- **Desktop / menu-bar apps — small, loyal niche valuing simplicity.** Guidance (macOS) reviewers describe it sitting "in the menu bar nicely without hampering workflow," used for "many years" (snippet): https://apps.apple.com/us/app/guidance/id412759995?mt=12. Newer open-source competitors (PrayerTime, PrayerTimes Pro) compute prayer times locally on-device — a privacy differentiator. Sources: https://www.prayer-time.app/, https://github.com/abd3lraouf-studios/PrayerTimes.
- **Multiple saved locations / travel mode — implied need.** Muslim App/Muslim Assistant advertises "times update automatically when you travel across time zones" as a marketed differentiator. Same listing as tracking feature above.
- **Dhikr/tasbih counter & duas/azkar after prayer — high, mature category.** A large number of dedicated apps (Tasbih Counter, Tasbih Counter Pro/Lite, Tasbih & Dhikr counter) confirm sustained demand as a companion feature. Sources: https://apps.apple.com/us/app/tasbih-counter-dhikr-azkar/id1190450937, https://apps.apple.com/us/app/tasbih-counter-pro-dhikr-app/id1341100401.
- **Sunnah prayers (duha, witr, tahajjud, last-third-of-night) and Quran reading progress** — only tangential evidence found (e.g., a "SunnahAssistant" GitHub repo name), no direct feature-request quote. Flagged as a gap for follow-up.
- **Family/group sharing — moderate, growing.** Just Pray Pro supports "family sharing, parents track their own salah while seeing their children's prayer habits," each with an individual streak. Source: https://justprayapp.co/blog/best-muslim-apps-families-kids. Zuhud pitches "social accountability" via friend/family "Circles" (snippet): https://apps.apple.com/us/app/zuhud/id6762648535.
- **Accessibility — thin evidence.** Pillars' listing states support for "gestures, braille, and speech output," a standard Apple accessibility metadata field rather than a user-driven request signal (snippet): https://apps.apple.com/us/app/pillars-prayer-times-qibla/id1559086853.
- **Arabic/RTL and localization — implied by scale, not directly quoted.** Al-Azan lists 13 languages including Arabic, Urdu, Persian as a core selling point, suggesting localization depth correlates with trust in this category (snippet): https://meypod.github.io/al-azan/en/.

## 4. What praised apps do well, and accepted pricing models

- **Mawaqit**: truth-to-mosque accuracy — the imam's actual iqama schedule, not a generic calculation. https://apps.apple.com/us/app/mawaqit-prayer-times-mosque/id1460522683.
- **Pillars**: trust + no ads + community input — "all your location data remains local... it never leaves it," donation-funded, community feedback/polls with Muslim Census. https://www.thepillarsapp.com/ (fetched directly).
- **Al-Azan/meypod**: verifiable privacy via open source — AGPL-3.0, "no internet permission so it can never access the internet," no trackers, local computation. https://github.com/meypod/al-azan, https://f-droid.org/en/packages/com.github.meypod.al_azan/.
- **Guidance (macOS)**: longevity and minimalism — reviewers describe returning to it for years (snippet): https://apps.apple.com/us/app/guidance/id412759995?mt=12.
- **Pricing models users accept:**
  - *Free + donations*: Pillars (directly fetched, confirmed).
  - *Fully free/open source, no monetization*: Al-Azan, Vakti, Muezzin — ad-free and privacy-first per their own descriptions (snippet-level for Vakti/Muezzin).
  - *One-time/lifetime purchase preferred over subscription*: a search snippet for Muslim App/Muslim Assistant (id1137963102) notes users pushing back on subscription pricing, prompting the developer to add "a lifetime purchase option" — direct evidence subscription fatigue is real.
  - *Ad-supported free tier with paywalled features*: Muslim Pro, Athan (IslamicFinder) — the model most associated with complaints here (Section 2).

## 5. Privacy & trust expectations — relevance to Meeqat's optional account

Users in this category explicitly reward: **no tracking** (Al-Azan, Pillars both market this as a headline claim, not a footnote), **offline capability** (Al-Azan ships with no internet permission at all; several menu-bar apps compute prayer times locally on-device, e.g. PrayerTimes Pro "computed on the Mac itself" per https://github.com/abd3lraouf-studios/PrayerTimes), **open source as a trust signal** (Al-Azan, Vakti, Muezzin, several menu-bar apps), and **minimal permissions**. The Muslim Pro/X-Mode episode (Section 2) is the clearest evidence that this audience treats undisclosed data sharing as a severe trust breach specifically *because* the app sits inside a devotional/private context — Middle East Eye documented explicit public denunciation: https://www.middleeasteye.net/news/us-military-data-muslim-pro-app-denounced.

**Relevance to Meeqat's planned optional Sanad sign-in:** the evidence supports making the account strictly opt-in, clearly scoped (what syncs vs. what doesn't), and ideally open about the fact that core prayer-time computation and notification scheduling remain fully local regardless of sign-in status — mirroring what the most-trusted apps in this space (Al-Azan, Pillars) already claim. Given the X-Mode precedent, any future analytics or third-party SDK addition would need proactive, plain-language disclosure to avoid the same backlash pattern.

## 6. Implications for Meeqat

| Finding | Meeqat status | Recommendation | Priority | Effort |
|---|---|---|---|---|
| Prayer tracking / streaks is now a baseline expectation (Pillars, Just Pray, Muslim App all ship it) | No | Add local prayer log + streak count; make cross-device sync an account-gated bonus, not a requirement | P0 | M |
| Ads/paywalls are the top complaint on the biggest apps | Yes (no ads) | Keep as-is; make "no ads, no tracking" a visible selling point in store listings | P1 | S |
| Undisclosed data sharing (X-Mode) caused severe, lasting trust damage | Yes (no tracking) | Publish a short, plain-language privacy statement proactively, before any account feature ships, listing exactly what does/doesn't leave the device | P0 | S |
| Iqama times / mosque-specific schedules is a distinct unmet need vs. calculated times (Mawaqit's whole pitch) | No | Consider optional mosque/iqama integration (e.g., Mawaqit API) as a stretch feature, kept opt-in and local-cache-first | P2 | L |
| Adhan notifications silently fail (Android battery kill, iOS 64-notification cap) | Partial (has notifications; unclear if this failure mode is handled) | Audit notification scheduling against both platform limits; add an in-app battery-optimization exemption prompt on Android | P0 | M |
| Calculation-method mismatches cause "wrong time" reports, not bugs | Unclear/assume Partial | Surface the active calculation method clearly in settings/UI so users can self-diagnose vs. their local mosque | P1 | S |
| Hijri date offset is a universal, unsolved calendar problem | Yes (has Hijri calendar) | Add manual +/- 1-2 day adjustment control, matching industry-standard workaround | P1 | S |
| DST/timezone bugs from fixed-offset math | Unclear — verify | Audit that all date/time math uses IANA timezones, not fixed UTC offsets, especially across DST transitions and travel | P0 | S |
| Per-prayer custom adhan sounds is a mainstream expectation | Partial (assume basic only) | Add per-prayer sound selection/custom audio import | P1 | M |
| Widgets and Live Activities are now competitive baseline on iOS/Android | Yes (Android widgets); no iOS Live Activity mentioned | If/when iOS ships, prioritize Live Activity/Dynamic Island for next-prayer countdown | P1 | M |
| Menu-bar/desktop apps are a small but loyal, satisfaction-driven niche (users value "just works, stays out of the way") | Yes | Keep the tray popover minimal; avoid feature bloat that would undermine the "unobtrusive utility" reputation | P2 | S |
| One-time purchase / donation / open-source pricing is well-received; subscriptions draw pushback | Yes (free, no ads/tracking) | If monetizing later, favor one-time purchase or voluntary donation over subscription | P2 | S |
| Ramadan mode (suhoor/iftar countdown, taraweeh tracking) is a real seasonal feature category | No | Add a seasonal Ramadan view (countdown + fasting log) reusing existing notification/adjustment infrastructure | P1 | M |
| Fasting tracker is requested alongside Ramadan mode | No | Bundle with Ramadan mode above rather than building standalone | P2 | M |
| Dhikr/tasbih counter is a mature, expected companion feature | No | Add a simple local tasbih counter screen; low complexity, high goodwill | P2 | S |
| Wearable support (Wear OS/watch) exists but is a smaller, currently-served-by-dedicated-apps niche | No | Defer; low priority relative to core mobile/desktop gaps | P2 | L |
| Family/group sharing and social accountability is a growing but secondary feature (Just Pray, Zuhud) | No | Defer until after account+sync is stable; this is the strongest case for actually needing accounts, since it requires multi-user state | P2 | L |
| Mosque finder / Jumu'ah info is valued but data-dependent (needs a mosque database/API) | No | Defer; evaluate feasibility of a data source before committing | P2 | L |
| Accessibility support is standard-but-thin evidence in this category (declared, rarely discussed in reviews) | Unclear — verify | Verify basic screen-reader/VoiceOver/TalkBack support exists across tray popover and Android widgets | P1 | S |
| Arabic/RTL depth correlates with trust/adoption for Muslim audiences (Al-Azan ships 13 languages) | Unclear — verify | Verify RTL layout correctness and Arabic string completeness across all surfaces (tray, widgets, notifications) | P1 | S |

**What justifies the optional account+sync vs. what should stay local-only:** cross-device prayer log/streaks, favorites/settings sync, and any future family/group-sharing feature are the genuine justifications for an account, since they require server-side state by definition. Notification scheduling, Qibla calculation, calculation-method logic, and widget rendering should all remain fully local regardless of sign-in status — this is both what privacy-conscious users in this category explicitly reward (Section 5) and consistent with Meeqat's existing no-ads/no-tracking posture.

## 7. Sources

**App Store / Play listings (some snippet-level only, as noted inline above):**
- https://play.google.com/store/apps/details?id=com.bitsmedia.android.muslimpro&hl=en_US
- https://play.google.com/store/apps/details?id=com.athan&hl=en
- https://apps.apple.com/us/app/muslim-assistant-salah-qibla/id1137963102
- https://www.thepillarsapp.com/ (directly fetched)
- https://apps.apple.com/us/app/pillars-prayer-times-qibla/id1559086853
- https://apps.apple.com/us/app/mawaqit-prayer-times-mosque/id1460522683
- https://mymasjidal.com/pages/athanplus
- https://www.masjidiapp.com/
- https://apps.apple.com/us/app/guidance/id412759995?mt=12
- https://www.prayer-time.app/
- https://apps.apple.com/us/app/tasbih-counter-dhikr-azkar/id1190450937
- https://apps.apple.com/us/app/tasbih-counter-pro-dhikr-app/id1341100401
- https://play.google.com/store/apps/details?id=app.islamhub.tasbihforwearos&hl=en_US
- https://apps.apple.com/us/app/prayer-pause-screen-time/id6757287456
- https://apps.apple.com/us/app/zuhud/id6762648535
- https://play.google.com/store/apps/details?id=com.github.meypod.al_azan&hl=en
- https://f-droid.org/en/packages/com.github.meypod.al_azan/

**GitHub issues / repos:**
- https://github.com/batoulapps/adhan-kotlin/issues/25
- https://github.com/AlmutazYounes/PrayerAthan/issues/4
- https://github.com/t1nk333r/athkar/issues/5
- https://github.com/ummahbuild/tryramadan
- https://github.com/meypod/al-azan
- https://github.com/meypod/al-azan-compose
- https://github.com/abd3lraouf-studios/PrayerTimes
- https://meypod.github.io/al-azan/en/

**News / incident reports (Muslim Pro / X-Mode, 2020):**
- https://www.vice.com/en/article/g5bq89/muslim-pro-location-data-military-xmode
- https://www.vice.com/en/article/epdkze/muslim-apps-location-data-military-xmode
- https://www.middleeasteye.net/news/us-military-data-muslim-pro-apps-ties-severed
- https://www.middleeasteye.net/news/us-military-data-muslim-pro-app-denounced
- https://www.aljazeera.com/amp/news/2020/11/18/muslim-pro-app-denies-selling-user-data-to-us-military
- https://religionnews.com/2020/11/18/muslim-prayer-times-app-stops-providing-user-data-to-firm-selling-to-us-military/
- https://www.christiancentury.org/news/popular-muslim-prayer-app-ends-relationship-firm-selling-data-us-military

**Official docs / policies / statements:**
- https://support.muslimpro.com/hc/en-us/articles/360052648551-Statement-from-Muslim-Pro
- https://support.muslimpro.com/hc/en-us/articles/360040773471-Android-Battery-Settings-for-Muslim-Pro-app
- https://support.muslimpro.com/hc/en-us/articles/200588785-The-app-is-not-playing-the-full-Adhan-iOS-Android
- https://support.muslimpro.com/hc/en-us/articles/200664340-The-Adhan-notifications-have-stopped-working-after-a-few-days-iOS-only
- https://support.muslimpro.com/hc/en-us/articles/200585195-The-adhan-notifications-are-not-working-iOS
- https://support.muslimpro.com/hc/en-us/articles/211664267-The-prayer-times-seem-to-be-one-hour-off-Daylight-Saving-Time-DST
- https://support.muslimpro.com/hc/en-us/articles/360042545591-How-to-Adjust-Islamic-Hijri-Calendar-Date
- https://support.muslimpro.com/hc/en-us/articles/32699302823193-Lockscreen-Updated-Widget-iOS
- https://www.muslimpro.com/updated-muslim-pro-widgets-for-ios/
- https://www.muslimtechwire.com/athan-pro-live-activities
- https://justprayapp.co/blog/best-muslim-apps-families-kids (developer's own blog; used for stated feature claims)

**Reddit:** despite multiple targeted `site:reddit.com` queries (battery-optimization notification failures, open-source app recommendations, qada/streak feature requests), search results consistently redirected to app-store and aggregator listings rather than actual Reddit threads. No Reddit URL is cited as evidence in this document — this is a genuine coverage gap in the requested method, flagged explicitly rather than papered over with a low-confidence link.

**Not cited as evidence (leads only, per instructions):** justuseapp.com aggregator pages, alternativeto.net, and generic Android battery-optimization explainer articles were used only to identify apps/features to verify, never as cited evidence for a claim.
