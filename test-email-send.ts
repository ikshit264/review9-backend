/**
 * Complete Email Service Live Test
 * Sends real test emails to verify functionality with verified domain
 */

import { ConfigService } from '@nestjs/config';
import { EmailService as MainEmailService } from './src/email/email.service';
import { EmailService as CommonEmailService } from './src/common/email.service';
import { getProfessionalEmailLayout, getScheduleUpdateEmailLayout } from './src/common/email.templates';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Mock ConfigService that reads from process.env
class MockConfigService {
  get<T = string>(key: string): T | undefined {
    return process.env[key] as T;
  }
}

const TEST_RECIPIENT = 'taha.sadikot.m@gmail.com';

async function testMainEmailService() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📧 TEST 1: Main Email Service (General Notifications)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const configService = new MockConfigService() as unknown as ConfigService;
  const emailService = new MainEmailService(configService);

  const htmlContent = getProfessionalEmailLayout({
    title: 'Email Service Test - Main Service',
    message: `This is a **test email** sent from the IntervAI backend using the Main Email Service with Resend API. 
    
    This test verifies that the email infrastructure is working correctly with your verified domain after migrating from Brevo/Nodemailer to Resend API.`,
    details: [
      { label: 'Service', value: 'Main Email Service (src/email/email.service.ts)' },
      { label: 'Provider', value: 'Resend API' },
      { label: 'Domain', value: process.env.MAIL_FROM || 'Not set' },
      { label: 'Test Date', value: new Date().toLocaleString() },
      { label: 'Status', value: '✅ Integration Successful' }
    ],
    buttonText: 'Visit IntervAI',
    buttonLink: 'https://inverv.entrext.in',
    footerText: 'This is an automated test email from the IntervAI platform.'
  });

  const textContent = `
Email Service Test - Main Service

This is a test email sent from the IntervAI backend using the Main Email Service (Resend API).

Service: Main Email Service (src/email/email.service.ts)
Provider: Resend API
Domain: ${process.env.MAIL_FROM}
Test Date: ${new Date().toLocaleString()}
Status: ✅ Integration Successful

This test verifies that the email infrastructure is working correctly with your verified domain.

Best regards,
IntervAI Team
  `;

  console.log(`📤 Sending test email to: ${TEST_RECIPIENT}`);
  console.log(`📋 Subject: IntervAI Email Test - Main Service`);
  console.log(`🔧 Using Resend API Key: ${process.env.RESEND_API_KEY?.substring(0, 8)}...`);
  console.log(`📨 From: ${process.env.MAIL_FROM_NAME} <${process.env.MAIL_FROM}>\n`);

  try {
    const result = await emailService.sendMail(
      TEST_RECIPIENT,
      'IntervAI Email Test - Main Service',
      textContent,
      htmlContent
    );

    if (result) {
      console.log('✅ SUCCESS: Email sent via Main Email Service');
      console.log(`   Check inbox: ${TEST_RECIPIENT}\n`);
      return true;
    } else {
      console.log('❌ FAILED: Email sending returned false\n');
      return false;
    }
  } catch (error: any) {
    console.error('❌ ERROR:', error.message);
    return false;
  }
}

async function testCommonEmailService() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📧 TEST 2: Common Email Service (Interview Invitations)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const configService = new MockConfigService() as unknown as ConfigService;
  const emailService = new CommonEmailService(configService);

  const testInviteData = {
    to: TEST_RECIPIENT,
    candidateName: 'Taha Sadikot',
    jobTitle: 'Senior Full Stack Developer',
    companyName: 'IntroBuddy',
    companyDescription: 'This is a test interview invitation to verify the email service integration with your verified domain.',
    scheduledTime: new Date('2026-02-15T14:00:00Z'),
    interviewLink: 'https://inverv.entrext.in/interview/test-token-12345',
    registrationLink: null,
    needsRegistration: false,
    notes: 'This is a test invitation. No actual interview will take place.',
  };

  console.log(`📤 Sending interview invitation to: ${TEST_RECIPIENT}`);
  console.log(`👤 Candidate: ${testInviteData.candidateName}`);
  console.log(`💼 Position: ${testInviteData.jobTitle}`);
  console.log(`🏢 Company: ${testInviteData.companyName}`);
  console.log(`📅 Scheduled: ${testInviteData.scheduledTime.toUTCString()}`);
  console.log(`🔧 Using Resend API Key: ${process.env.RESEND_API_KEY?.substring(0, 8)}...`);
  console.log(`📨 From: ${process.env.MAIL_FROM_NAME} <${process.env.MAIL_FROM}>\n`);

  try {
    await emailService.sendInterviewInvite(testInviteData);
    console.log('✅ SUCCESS: Interview invitation sent via Common Email Service');
    console.log(`   Check inbox: ${TEST_RECIPIENT}\n`);
    return true;
  } catch (error: any) {
    console.error('❌ ERROR:', error.message);
    if (error.response) {
      console.error('   Response:', error.response);
    }
    return false;
  }
}

async function testScheduleUpdateEmail() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📧 TEST 3: Schedule Update Email Template');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const configService = new MockConfigService() as unknown as ConfigService;
  const emailService = new MainEmailService(configService);

  const htmlContent = getScheduleUpdateEmailLayout({
    title: 'Interview Rescheduled',
    candidateName: 'Taha Sadikot',
    message: `Your interview has been rescheduled. Please note the new date and time below. This is a **test email** to verify the schedule update template with your verified domain.`,
    details: [
      { label: 'Position', value: 'Senior Full Stack Developer' },
      { label: 'Company', value: 'IntroBuddy' },
      { label: 'New Date', value: 'February 20, 2026' },
      { label: 'New Time', value: '3:00 PM UTC' },
      { label: 'Duration', value: '45 minutes' }
    ],
    buttonText: 'View Updated Schedule',
    buttonLink: 'https://inverv.entrext.in/scheduled',
    footerText: 'This is a test email to verify schedule update functionality.'
  });

  console.log(`📤 Sending schedule update email to: ${TEST_RECIPIENT}`);
  console.log(`📋 Subject: Interview Rescheduled - Test`);
  console.log(`🔧 Using Resend API Key: ${process.env.RESEND_API_KEY?.substring(0, 8)}...\n`);

  try {
    const result = await emailService.sendMail(
      TEST_RECIPIENT,
      '🔄 Interview Rescheduled - IntervAI Test',
      'Your interview has been rescheduled. Check the email for details.',
      htmlContent
    );

    if (result) {
      console.log('✅ SUCCESS: Schedule update email sent');
      console.log(`   Check inbox: ${TEST_RECIPIENT}\n`);
      return true;
    } else {
      console.log('❌ FAILED: Email sending returned false\n');
      return false;
    }
  } catch (error: any) {
    console.error('❌ ERROR:', error.message);
    return false;
  }
}

async function runLiveTests() {
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║                                                                ║');
  console.log('║     🚀  LIVE EMAIL SERVICE TEST - RESEND API                  ║');
  console.log('║          WITH VERIFIED DOMAIN                                  ║');
  console.log('║                                                                ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  console.log(`📅 Test Date: ${new Date().toLocaleString()}`);
  console.log(`📬 Recipient: ${TEST_RECIPIENT}`);
  console.log(`🔑 API Key: ${process.env.RESEND_API_KEY ? '✅ Found' : '❌ Missing'}`);
  console.log(`📨 From Email: ${process.env.MAIL_FROM || 'Not set'}`);
  console.log(`👤 From Name: ${process.env.MAIL_FROM_NAME || 'Not set'}`);
  console.log(`⚡ Mail Enabled: ${process.env.MAIL_ENABLED || 'true'}`);
  console.log(`🌐 Domain Status: ${process.env.MAIL_FROM?.includes('entrext.com') ? '✅ Verified Domain' : '⚠️ Test Domain'}\n`);

  if (!process.env.RESEND_API_KEY) {
    console.error('❌ RESEND_API_KEY not found in environment');
    console.error('   Please set it in your .env file\n');
    process.exit(1);
  }

  const results = {
    mainService: false,
    commonService: false,
    scheduleUpdate: false,
  };

  try {
    // Test 1: Main Email Service
    results.mainService = await testMainEmailService();
    
    // Wait 2 seconds between tests to avoid rate limiting
    console.log('⏳ Waiting 2 seconds before next test...\n');
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Test 2: Common Email Service (Interview Invitation)
    results.commonService = await testCommonEmailService();
    
    // Wait 2 seconds between tests
    console.log('⏳ Waiting 2 seconds before next test...\n');
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Test 3: Schedule Update Email
    results.scheduleUpdate = await testScheduleUpdateEmail();

    // Final Summary
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 TEST RESULTS SUMMARY');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    console.log(`Main Email Service:          ${results.mainService ? '✅ PASSED' : '❌ FAILED'}`);
    console.log(`Common Email Service:        ${results.commonService ? '✅ PASSED' : '❌ FAILED'}`);
    console.log(`Schedule Update Template:    ${results.scheduleUpdate ? '✅ PASSED' : '❌ FAILED'}\n`);

    const totalTests = 3;
    const passedTests = Object.values(results).filter(r => r).length;
    
    console.log(`Total: ${passedTests}/${totalTests} tests passed\n`);

    if (passedTests === totalTests) {
      console.log('🎉 ALL TESTS PASSED! Email service is fully functional.\n');
      console.log(`📬 Check your inbox at: ${TEST_RECIPIENT}`);
      console.log('   You should have received 3 test emails:\n');
      console.log('   1. General notification email');
      console.log('   2. Interview invitation email');
      console.log('   3. Schedule update email\n');
      console.log('✅ Email service with verified domain is working perfectly!');
      console.log('✅ Ready for production deployment on Render!\n');
    } else {
      console.log('⚠️  Some tests failed. Check the logs above for details.\n');
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  } catch (error: any) {
    console.error('\n❌ Fatal error during testing:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

// Run the live tests
runLiveTests().catch(console.error);
