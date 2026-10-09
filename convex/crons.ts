import { cronJobs } from 'convex/server';
import { internal } from './_generated/api';

const crons = cronJobs();
// 4 h UTC : 6 h à Paris l'été, 5 h l'hiver.
crons.daily('remplir la to-do du jour', { hourUTC: 4, minuteUTC: 0 }, internal.todos.autoFill, {});
export default crons;
