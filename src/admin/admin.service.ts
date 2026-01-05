import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ApprovalStatus, Role } from '@prisma/client';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class AdminService {
  constructor(
    private prisma: PrismaService,
    private notificationsService: NotificationsService,
  ) {}

  async getCompanies(page: number = 1, limit: number = 10) {
    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      this.prisma.user.findMany({
        where: { role: Role.COMPANY },
        select: {
          id: true,
          email: true,
          name: true,
          approvalStatus: true,
          createdAt: true,
          plan: true,
          _count: {
            select: { jobs: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.user.count({ where: { role: Role.COMPANY } }),
    ]);

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async approveCompany(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user || user.role !== Role.COMPANY) {
      throw new NotFoundException('Company not found');
    }

    const token =
      Math.random().toString(36).substring(2, 15) +
      Math.random().toString(36).substring(2, 15);
    const expires = new Date();
    expires.setHours(expires.getHours() + 24); // 24 hour expiry for approval

    await this.prisma.user.update({
      where: { id },
      data: {
        approvalStatus: ApprovalStatus.APPROVED,
        verificationToken: token,
        verificationTokenExpires: expires,
      },
    });

    // Send notification/email with verification link
    const appUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const verificationLink = `${appUrl}/verify?token=${token}`;

    await this.notificationsService.createForEmail(user.email, {
      type: 'EMAIL',
      title: 'Account Approved - Verify to Activate',
      message: `Your HireAI company account has been approved. Please click the link below to verify your email and activate your account.`,
      link: verificationLink,
    });

    return { message: 'Company approved and verification email sent' };
  }

  async rejectCompany(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user || user.role !== Role.COMPANY) {
      throw new NotFoundException('Company not found');
    }

    await this.prisma.user.update({
      where: { id },
      data: { approvalStatus: ApprovalStatus.REJECTED },
    });

    await this.notificationsService.createForEmail(user.email, {
      type: 'EMAIL',
      title: 'Account Status Update',
      message:
        'Your HireAI company account request has been reviewed and rejected at this time.',
    });

    return { message: 'Company rejected successfully' };
  }

  async getActivities() {
    // Fetch recent jobs, interviews, etc.
    const [recentJobs, recentInterviews, recentUsers] = await Promise.all([
      this.prisma.job.findMany({
        take: 5,
        orderBy: { createdAt: 'desc' },
        include: { company: { select: { name: true } } },
      }),
      this.prisma.interviewSession.findMany({
        take: 5,
        orderBy: { startTime: 'desc' },
        include: {
          candidate: { select: { name: true } },
          job: { select: { title: true } },
        },
      }),
      this.prisma.user.findMany({
        take: 5,
        orderBy: { createdAt: 'desc' },
        select: { email: true, role: true, name: true, createdAt: true },
      }),
    ]);

    return {
      recentJobs,
      recentInterviews,
      recentUsers,
      stats: {
        totalCompanies: await this.prisma.user.count({
          where: { role: Role.COMPANY },
        }),
        totalCandidates: await this.prisma.user.count({
          where: { role: Role.CANDIDATE },
        }),
        totalJobs: await this.prisma.job.count(),
        totalInterviews: await this.prisma.interviewSession.count(),
        pendingApprovals: await this.prisma.user.count({
          where: { role: Role.COMPANY, approvalStatus: ApprovalStatus.PENDING },
        }),
      },
    };
  }
}
