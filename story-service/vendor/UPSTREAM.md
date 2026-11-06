# InkOS source reuse

Source: https://github.com/dzy888/inkos/tree/53adac4e974b54dafda975edc4edd07cad364c18
Original project: https://github.com/Narcooo/inkos
License: AGPL-3.0-only (LICENSE.inkos).

Pinned core and Studio server sources and built-in creative skills are reused here; Studio React sources are in web/src/features/stories/inkos. Tests and standalone CLI are excluded. DmxVideo changes: managed LLM/image routing, disabled host-global environment access, authenticated API prefix, native theme/navigation/model controls and browser account scoping. Business pipelines, review, revisions, work artifacts, translations, story graphs and creative sessions remain upstream code.

Story persistence is adapted in `src/storage` and the worker build aliases. Original creative pipelines and public Studio routes remain reused; PostgreSQL stores documents, episode events, play state and lexical search in New API’s database. Source snapshot reads and legacy presentation receipt reads support PostgreSQL record snapshots; read-only SQLite is retained for one-time legacy import and regression fixtures.
