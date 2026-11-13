module.exports = async function* (source) {
  let pass = 0;
  let fail = 0;
  let skip = 0;
  for await (const event of source) {
    if (event.type !== "test:pass" && event.type !== "test:fail") continue;
    const { data } = event;
    if (data.details && data.details.type === "suite") continue;
    if (data.skip || data.todo) skip++;
    else if (event.type === "test:pass") pass++;
    else fail++;
  }
  const count = pass + fail + skip;
  console.log(`count: ${count} pass: ${pass} fail: ${fail} skip: ${skip}`);
};
