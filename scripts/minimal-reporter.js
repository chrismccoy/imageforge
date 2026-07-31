module.exports = async function* (source) {
  let pass = 0;
  let fail = 0;
  for await (const event of source) {
    if (event.type === "test:pass") pass++;
    if (event.type === "test:fail") fail++;
  }
  const count = pass + fail;
  console.log(`count: ${count} pass: ${pass} fail: ${fail}`);
};
