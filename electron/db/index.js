import * as db from "./connection.js";
import * as auth from "./auth.js";
import * as user from "./user.js";
import * as journal from "./journal.js";
import * as media from "./media.js";
import * as category from "./categories.js";
import * as goal from "./goal.js";
import * as logs from "./progressLogs.js";
import * as dashboard from "./dashboard.js";
import * as chat from "./chat.js";
import * as exportData from "./exportData.js";

// Export all database functions in a structured object
const localDB = {
  ...db,
  ...auth,
  ...user,
  ...journal,
  ...media,
  ...category,
  ...goal,
  ...logs,
  ...dashboard,
  ...chat,
  ...exportData,
};

export default localDB;
