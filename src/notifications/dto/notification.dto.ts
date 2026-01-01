import { IsString, IsOptional, IsEnum, IsBoolean, IsEmail, IsInt, Min } from 'class-validator';
import { NotificationType } from '@prisma/client';
import { Type, Transform } from 'class-transformer';

export class CreateNotificationDto {
    @IsEnum(NotificationType)
    @IsOptional()
    type?: NotificationType;

    @IsString()
    title: string;

    @IsString()
    message: string;

    @IsString()
    @IsOptional()
    link?: string;

    @IsEmail()
    email: string;
}

export class GetNotificationDto {
    @IsOptional()
    @Type(() => Date)
    since?: Date;

    @IsString()
    @IsOptional()
    cursor?: string; // Notification ID to start from

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    take?: number; // Number of notifications to fetch (default: 20)
}
