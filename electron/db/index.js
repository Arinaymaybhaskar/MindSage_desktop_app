import * as db from './connection.js'
import * as auth from './auth.js';
import * as user from './user.js';
import * as journal from './journal.js';
import * as media from './media.js';

// Export all database functions in a structured object
const localDB = {
    ...db,
    ...auth,
    ...user,
    ...journal,
    ...media
};

export default localDB;