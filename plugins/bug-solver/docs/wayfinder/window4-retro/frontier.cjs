'use strict';
const fs = require('node:fs');
const path = require('node:path');
const dir = path.join(__dirname, 'issues');
const tickets = fs.readdirSync(dir).filter(f => f.endsWith('.md')).map(file => {
  const body = fs.readFileSync(path.join(dir, file), 'utf8');
  const get = key => (body.match(new RegExp('^' + key + ': (.*)$', 'm')) || [,''])[1].trim();
  return {file, id:get('id'), title:get('title'), status:get('status'), assignee:get('assignee'),
    blockers:get('blocked_by').replace(/[\[\]]/g,'').split(',').map(x=>x.trim()).filter(Boolean)};
});
for (const ticket of tickets) {
  const unblocked = ticket.blockers.every(id => tickets.some(t => t.id === id && t.status === 'closed'));
  if (ticket.status === 'open' && (!ticket.assignee || ticket.assignee === 'null') && unblocked)
    console.log(ticket.title + ' — issues/' + ticket.file);
}
