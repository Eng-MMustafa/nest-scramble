import * as express from 'express';
const app = express();
app.get('/', (req, res) => res.json({ ok: true }));
app.listen(3000);
