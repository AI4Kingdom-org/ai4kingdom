import { defineAuth } from '@aws-amplify/backend';

export const auth = defineAuth({
  loginWith: {
    email: {
      verificationEmailSubject: '验证你的邮箱',
      verificationEmailBody: (code: () => string) => `你的验证码是: ${code()}`
    },
    phone: undefined
  }
});
