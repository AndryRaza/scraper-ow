# Scraper OW TWEETS 

Petit projet me permettant de récupérer les news d'Overwatch (patchnote, esport, etc). L'endpoint /api/tweets me permettra de récupérer ses infos en JSON, pour être traités plus tard par l'IA pour qu'il puisse classer en différentes catégories.  

| Méthode | Chemin | Fichier |
|---------|--------|---------|
| `GET` | `/` | `routes/index.js` |
| `GET` | `/users` | `routes/users.js` |
| `GET` | `/bo` | `routes/bo.js` — dashboard EJS |
| `POST` | `/bo/api/tweets/delete` | `routes/bo.js` — suppr. groupée |
| `GET` | `/api/tweets` | `routes/scrape.js` — tweets stockés |
| `GET` | `/api/tweets/list` | `routes/scrape.js` — paginé/trié |
| `POST` | `/api/scrape` | `routes/scrape.js` — lancer scraping |
| `POST` | `/api/scrape/cancel` | `routes/scrape.js` — annuler scraping |
| `GET` | `/api/accounts` | `routes/scrape.js` — lister comptes |
| `POST` | `/api/accounts` | `routes/scrape.js` — ajouter compte |
| `DELETE` | `/api/accounts/:account` | `routes/scrape.js` — supprimer compte |
| `PATCH` | `/api/accounts/:account` | `routes/scrape.js` — toggle enabled |
