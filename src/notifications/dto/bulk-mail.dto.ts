import { IsString, IsArray, IsOptional, ValidateNested, IsEmail } from 'class-validator';
import { Type } from 'class-transformer';

export class BulkMailRecipient {
    @IsEmail()
    email: string;

    @IsString()
    name: string;

    @IsOptional()
    customData?: Record<string, unknown>;
}

export class BulkMailDto {
    @IsString()
    subject: string;

    @IsString()
    @IsOptional()
    textContent?: string;

    @IsString()
    @IsOptional()
    htmlContent?: string;

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => BulkMailRecipient)
    recipients: BulkMailRecipient[];

    @IsOptional()
    createNotification?: boolean;

    @IsOptional()
    notificationTitle?: string;

    @IsOptional()
    notificationMessage?: string;

    @IsOptional()
    notificationLink?: string;
}
