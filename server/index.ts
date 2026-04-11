import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { router } from './routes';
import { requestLogger } from './middleware/requestLogger';
import { logger } from './utils/logger';

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(requestLogger);
app.use('/api', router);

app.listen(PORT, () => {
  logger.info(`Server running on http://localhost:${PORT}`, { port: PORT });
});
