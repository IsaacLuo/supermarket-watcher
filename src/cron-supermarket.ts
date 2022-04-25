import { CronJob } from "cron";
import { scan } from "./supermarket";
export function cronSupermarket() {
  const job = new CronJob('0 8 * * * *', function () {
    console.log('Updating supermarket information');
    scan();
  }, null, true, 'Europe/London');
  job.start();
}