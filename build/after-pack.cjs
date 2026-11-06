// The project lives under ~/Documents (iCloud): files pick up FinderInfo/fileprovider
// xattrs that make codesign fail with "resource fork, Finder information, or similar detritus".
const { execFileSync } = require("node:child_process");

exports.default = async ({ appOutDir }) => {
  execFileSync("xattr", ["-cr", appOutDir]);
};
