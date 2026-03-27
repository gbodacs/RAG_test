import { query } from "./vectorsearch.js";
import { upload_db } from "./upload.js";


async function main() {
  // await upload_db()
  // console.log("Database uploaded.")

  const ret = await query("Ki és milyen büntetést kapott?")
  console.log("--------------------------------")
  console.log("Answer:", ret.answer)
}

(async () => {
  await main();
})();