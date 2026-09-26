import mongoose from 'mongoose';
import { connectMongo, createDatabase } from '../../lib/db/src/query';
import { employeesTable, organizationDetailsTable, usersTable } from '../../lib/db/src/schema';
await connectMongo();
const db = createDatabase();
console.log(JSON.stringify({ database: mongoose.connection.name,
  host: mongoose.connection.host,
  employeeCount: await db.count(employeesTable), userCount: await db.count(usersTable),
  organizations: (await db.select().from(organizationDetailsTable)).map(r => ({id:r.organizationId,name:r.companyName})),
  employees: (await db.select().from(employeesTable)).filter(r => /aakash/i.test(r.name)).map(r => ({id:r.id,name:r.name,code:r.employeeCode,org:r.organizationId,systemKey:r.systemKey,salary:r.baseSalary})),
  users: (await db.select().from(usersTable)).filter(r => /aakash/i.test(r.username)).map(r => ({id:r.id,username:r.username,org:r.organizationId}))
}, null, 2));
await mongoose.disconnect();
