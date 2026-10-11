import {redirect} from 'next/navigation';
import {teacherSession} from '@/lib/auth.js';
import TeacherShell from '@/components/TeacherShell.js';
export default async function TeacherLayout({children}){const teacher=await teacherSession();if(!teacher)redirect('/guru/login');if(teacher.changePasswordRequired)redirect('/guru/login?ubah=1');return <TeacherShell teacher={teacher}>{children}</TeacherShell>}
