# Automatisation du scraping

## Principe

Twitter/X nécessite un **navigateur visible** (`headless: false`) pour ne pas être bloqué.
Cela signifie que l'automatisation complète 100 % silencieuse est impossible avec le scraping web.

En revanche, une fois les cookies sauvegardés, le scraping peut tourner **sans interaction**
tant que les cookies restent valides (quelques jours à quelques semaines).

## Flux recommandé

```
Premier lancement (manuel) :   node scripts/scrape.js
  → Navigateur visible, login manuel, cookies sauvegardés automatiquement

Lancements suivants (auto) :   node scripts/scrape-auto.js
  → Réutilise les cookies, pas d'interaction requise
  → Échoue proprement si les cookies ont expiré
```

## Scripts disponibles

| Script | Usage | Interaction |
|---|---|---|
| `scripts/scrape.js` | Manuel / première fois | Oui (login + Entrée) |
| `scripts/scrape-auto.js` | Cron / planificateur | Non (échoue si cookies invalides) |

## Planification avec cron (Linux/macOS)

Edite ton crontab :
```bash
crontab -e
```

Exemple : scraper toutes les 3 heures
```cron
0 */3 * * * cd /chemin/vers/scraper-ow-tweets && node scripts/scrape-auto.js >> logs/scrape.log 2>&1
```

## Planification avec le Planificateur de tâches Windows

1. Ouvre `taskschd.msc`
2. Crée une nouvelle tâche de base
3. Déclencheur : quotidien ou toutes les X heures
4. Action : démarrer un programme
   - Programme : `node`
   - Arguments : `scripts/scrape-auto.js`
   - Démarrer dans : `D:\chemin\vers\scraper-ow-tweets`
5. Coche "Exécuter même si l'utilisateur n'est pas connecté" (si besoin)

> **IMPORTANT** : Le planificateur doit s'exécuter dans une **session utilisateur interactive**
> (car le navigateur visible doit pouvoir s'afficher). Si la machine est verrouillée/sans session,
> le scraping échouera.

## Planification avec node-cron (optionnel)

Si tu préfères garder la logique dans Node.js :

```bash
npm install node-cron
```

Crée un fichier `scheduler.js` :

```javascript
const cron = require('node-cron');
const { spawn } = require('child_process');

cron.schedule('0 */3 * * *', () => {
  console.log('Lancement automatique du scraping...');
  const child = spawn('node', ['scripts/scrape-auto.js'], { stdio: 'inherit' });
  child.on('close', (code) => {
    console.log(`Scraping terminé avec le code ${code}`);
  });
});
```

Puis lance :
```bash
node scheduler.js
```

## Gestion des cookies expirés

Si `scrape-auto.js` échoue avec :
```
Cookies invalides ou expirés.
```

Il faut relancer manuellement pour régénérer les cookies :
```bash
node scripts/scrape.js
```

Connecte-toi à nouveau dans le navigateur, puis les prochains `scrape-auto.js`
reprendront normalement.

## Quand les cookies expirent ?

Twitter/X invalide les sessions dans les cas suivants :
- Connexion depuis un nouvel appareil / IP
- Changement de mot de passe
- Inactivité prolongée (2–4 semaines)
- Détection de comportement suspect

Il est donc normal de devoir relancer le mode manuel de temps en temps.
