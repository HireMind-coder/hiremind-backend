// Run from the api-server folder:  node fix-push.mjs
// Removes misplaced push-notification blocks and re-inserts them inside the right route handlers.
import fs from "node:fs";

const BLOCKS = {
  attendance: [
    "// Push: employee check-in/out -> admin. Admin-marked (kiosk) -> that employee.",
    "try {",
    "  const isEmployeeCaller = (req as any).user.role === 'employee';",
    "  const name = employeeMap.get(att.employeeId) || 'Employee';",
    "  const isOut = !!att.checkOut;",
    "  if (att.checkIn || att.checkOut) {",
    "    const time = isOut ? att.checkOut : att.checkIn;",
    "    if (isEmployeeCaller) {",
    "      void notifyAdmin(adminId, {",
    "        title: isOut ? 'Check-out' : 'Check-in',",
    "        body: `${name} ${isOut ? 'checked out' : 'checked in'} at ${time}`,",
    "        screen: '/(tabs)/attendance',",
    "      });",
    "    } else {",
    "      void notifyEmployee(att.employeeId, {",
    "        title: isOut ? 'Check-out recorded' : 'Check-in recorded',",
    "        body: `Your ${isOut ? 'check-out' : 'check-in'} was recorded at ${time}`,",
    "        screen: '/(employee)/attendance',",
    "      });",
    "    }",
    "  }",
    "} catch (err) {",
    "  console.log('Push notification failed:', err);",
    "}",
  ],
  payments: [
    "if (payment.status === 'paid') {",
    "  void notifyEmployee(employee.id, {",
    "    title: 'Payment received',",
    "    body: `${payment.type}: ₹${Number(payment.amount).toLocaleString('en-IN')} paid via ${payment.method}`,",
    "    screen: '/(employee)/',",
    "  });",
    "}",
  ],
  tasks: [
    "void notifyEmployee(employee.id, {",
    "  title: 'New task assigned',",
    "  body: task.title,",
    "  screen: '/(employee)/tasks',",
    "});",
  ],
  leavePost: [
    "if (req.user!.role === 'employee') {",
    "  void notifyAdmin(adminId, {",
    "    title: 'New leave request',",
    "    body: `${emp.name} requested ${days} day(s) of ${type} leave`,",
    "    screen: '/leaves',",
    "  });",
    "}",
  ],
  leaveApprove: [
    "void notifyEmployee(leave.employeeId, {",
    "  title: 'Leave approved',",
    "  body: `Your ${leave.type} leave (${leave.startDate} to ${leave.endDate}) was approved`,",
    "  screen: '/(employee)/leaves',",
    "});",
  ],
  leaveReject: [
    "void notifyEmployee(leave.employeeId, {",
    "  title: 'Leave rejected',",
    "  body: `Your ${leave.type} leave (${leave.startDate} to ${leave.endDate}) was rejected`,",
    "  screen: '/(employee)/leaves',",
    "});",
  ],
};

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Regex that matches a block no matter how it was indented, and with " or ' quotes.
function blockRegex(lines) {
  const text = lines.filter((l) => !l.trim().startsWith("//")).join("\n");
  const src = text
    .split(/\s+/)
    .filter(Boolean)
    .map((tok) => esc(tok).replace(/["']/g, "[\"']"))
    .join("\\s+");
  return new RegExp(`[ \\t]*${src}[ \\t]*\\r?\\n?`, "g");
}

function removeAll(src, lines) {
  return src.replace(blockRegex(lines), "");
}

function render(lines, indent, eol) {
  return lines.map((l) => (l ? indent + l : l)).join(eol) + eol;
}

function fixFile(file, steps) {
  if (!fs.existsSync(file)) {
    console.log(`SKIP  ${file} (not found)`);
    return;
  }
  let src = fs.readFileSync(file, "utf8");
  const eol = src.includes("\r\n") ? "\r\n" : "\n";
  fs.writeFileSync(file + ".bak", src);

  // 1) remove every previously pasted block (wherever it ended up)
  src = src.replace(/^[ \t]*\/\/ Push: employee check-in\/out[^\r\n]*\r?\n/gm, "");
  for (const s of steps) src = removeAll(src, BLOCKS[s.block]);

  // 2) insert each block at its correct anchor
  for (const s of steps) {
    const m = s.anchor.exec(src);
    if (!m) {
      console.log(`WARN  ${file}: anchor for "${s.block}" not found - not inserted`);
      continue;
    }
    const at = s.after ? m.index + m[0].length : m.index;
    const body = render(BLOCKS[s.block], s.indent, eol); // ends with a newline
    const insertion = s.after ? eol + body : body + eol;
    src = src.slice(0, at) + insertion + src.slice(at);
  }

  fs.writeFileSync(file, src);
  const calls = (src.match(/void notify(Admin|Employee)\(/g) || []).length;
  const expected = steps.length === 1 && steps[0].block === "attendance" ? 2 : steps.reduce((n, s) => n + (s.block === "attendance" ? 2 : 1), 0);
  console.log(`${calls === expected ? "OK   " : "WARN "} ${file}: ${calls} push call(s) (expected ${expected})`);
}

fixFile("src/routes/attendance.ts", [
  { block: "attendance", indent: "    ", after: true,
    anchor: /console\.log\(\s*["']Email notification failed:["']\s*,\s*err\s*\);\s*\}[ \t]*\r?\n(?:[ \t]*\/\/[^\r\n]*\r?\n)?/ },
]);
fixFile("src/routes/payments.ts", [
  { block: "payments", indent: "  ", after: false,
    anchor: /^[ \t]*res\.status\(201\)\.json\(\{\s*\.\.\.payment,/m },
]);
fixFile("src/routes/tasks.ts", [
  { block: "tasks", indent: "  ", after: false,
    anchor: /^[ \t]*res\.status\(201\)\.json\(\{\s*\.\.\.task,/m },
]);
fixFile("src/routes/leaves.ts", [
  { block: "leavePost", indent: "  ", after: false,
    anchor: /^[ \t]*res\.status\(201\)\.json\(leave\);/m },
  { block: "leaveApprove", indent: "  ", after: false,
    anchor: /^[ \t]*res\.json\(updated\);\s*\}\);\s*router\.patch\(\s*["']\/leaves\/:id\/reject["']/m },
  { block: "leaveReject", indent: "  ", after: false,
    anchor: /^[ \t]*res\.json\(updated\);\s*\}\);\s*router\.delete\(\s*["']\/leaves\/:id["']/m },
]);

console.log("\nDone. Backups saved as *.bak next to each file. Now run:  pnpm run build");