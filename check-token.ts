
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function checkToken() {
    const token = '57286d1b-7aa5-44ee-bfda-c0b2425dd4b6';
    const candidate = await prisma.candidate.findUnique({
        where: { interviewLink: token },
        include: { job: true }
    });

    if (candidate) {
        console.log('FOUND:', JSON.stringify(candidate, null, 2));
    } else {
        console.log('NOT FOUND');
        const all = await prisma.candidate.findMany({
            select: { interviewLink: true, email: true }
        });
        console.log('Current Tokens:', all);
    }
}

checkToken().finally(() => prisma.$disconnect());
