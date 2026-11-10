# Landscape: who else does Dialog menus, and what SAO Minecraft really is
Checked 2026-11-10 from public pages only. Hermes installed and ran none of the third-party tools; "claims" = vendor text, not verified.

## SAO Minecraft (the Threads hit)
- Triggers Studio server. saominecraft.com/us: the official launcher "Triggers Client" "installs and keeps the game, the mod and the
  resource pack up to date". Patch notes (news/paliers-2-et-3-ouverts, ...-reportes-...): "players with the latest version of the mod",
  "Floor 3: merchants use the new shop interface (no more vanilla menus)". So its UI is a client mod, not Dialog.
- Review video (YouTube, Bawss, 2026-10-29): pressing Esc opens the SAO menu. A Dialog cannot replace the pause screen.
  (Inference: the Esc menu is a mod screen.)

## Same technique as ours: Dialog + pictures in a resource pack
- Glyphwork (open source): the reference we followed.
- ResourcePack AI Studio (resourcepack.ai/docs/dialogs), paid AI credits (30 per generated dialog), plugins Dialog Engine / RP Engine
  (free) fill live values per player. Claims: HD picture (2x detail), motion/floating/animated pictures "played by your resource pack"
  (shader), typing in a drawn box, footer button can be replaced, bars that follow the player's health/hunger (values filled when opened),
  click sounds by plugin. Cannot remove the blur behind a dialog (their FAQ). Older "UI-style" dialogs = drawn 256x256 picture + areas.

## Not Dialog: MC GUI (ResourcePack AI, free, GPL-3.0, published 2026-10-24, Hangar: 69 downloads / 1 star at check time)
- Paper/Spigot/Folia 1.21.11+ plugin, vanilla clients, resource pack required for fullscreen pages. Claims: fullscreen HTML/CSS pages,
  the player sits and the camera locks, the mouse moves a pointer, CSS transitions/animations, overlays on top of the world, wall screens.
  Editor: mcgui.dev (templates: server menu, shop, selector, leaderboard, rules).
- This is the closest "no client mod" route to an SAO-like feel. It is a server plugin (our export is a plain data pack + resource pack).
