/* POST /api/session issues a signed 2-hour token (asks for SQ_ACCESS_CODE when set) */
import { sessionHandler } from '../server/http-api.mjs';
export default sessionHandler;
