<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

[circleci-image]: https://img.shields.io/circleci/build/github/nestjs/nest/master?token=abc123def456
[circleci-url]: https://circleci.com/gh/nestjs/nest

  <p align="center">A progressive <a href="http://nodejs.org" target="_blank">Node.js</a> framework for building efficient and scalable server-side applications.</p>
    <p align="center">
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/dm/@nestjs/common.svg" alt="NPM Downloads" /></a>
<a href="https://circleci.com/gh/nestjs/nest" target="_blank"><img src="https://img.shields.io/circleci/build/github/nestjs/nest/master" alt="CircleCI" /></a>
<a href="https://discord.gg/G7Qnnhy" target="_blank"><img src="https://img.shields.io/badge/discord-online-brightgreen.svg" alt="Discord"/></a>
<a href="https://opencollective.com/nest#backer" target="_blank"><img src="https://opencollective.com/nest/backers/badge.svg" alt="Backers on Open Collective" /></a>
<a href="https://opencollective.com/nest#sponsor" target="_blank"><img src="https://opencollective.com/nest/sponsors/badge.svg" alt="Sponsors on Open Collective" /></a>
  <a href="https://paypal.me/kamilmysliwiec" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg" alt="Donate us"/></a>
    <a href="https://opencollective.com/nest#sponsor"  target="_blank"><img src="https://img.shields.io/badge/Support%20us-Open%20Collective-41B883.svg" alt="Support us"></a>
  <a href="https://twitter.com/nestframework" target="_blank"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow" alt="Follow us on Twitter"></a>
</p>
  <!--[![Backers on Open Collective](https://opencollective.com/nest/backers/badge.svg)](https://opencollective.com/nest#backer)
  [![Sponsors on Open Collective](https://opencollective.com/nest/sponsors/badge.svg)](https://opencollective.com/nest#sponsor)-->

## Description

[Nest](https://github.com/nestjs/nest) framework TypeScript starter repository.

## Project setup

```bash
$ npm install
```

## Compile and run the project

```bash
# development
$ npm run start

# watch mode
$ npm run start:dev

# production mode
$ npm run start:prod
```

## Run tests

```bash
# unit tests
$ npm run test

# e2e tests
$ npm run test:e2e

# test coverage
$ npm run test:cov
```

## WhatsApp OTP setup guide

This project supports phone login with OTP delivered via WhatsApp (Meta WhatsApp Cloud API).

### 1) Configure environment variables

Set these in `.env`:

```env
# Required for production WhatsApp delivery
WHATSAPP_ACCESS_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=

# Optional (defaults shown)
WHATSAPP_GRAPH_API_VERSION=v21.0
WHATSAPP_OTP_TEMPLATE_NAME=
WHATSAPP_OTP_TEMPLATE_LANG=en

# CORS for client web app
CLIENT_WEB_ORIGIN=http://localhost:5173
```

Notes:
- If `WHATSAPP_ACCESS_TOKEN` and `WHATSAPP_PHONE_NUMBER_ID` are present, OTP is sent to WhatsApp.
- In production, if WhatsApp is not configured, OTP request returns `OTP_DELIVERY_NOT_CONFIGURED` (503).
- In development without WhatsApp config, API returns `_devCode` for testing.

### 2) Meta WhatsApp Cloud API prerequisites

In Meta Developer console:
- Create/select an app with WhatsApp product enabled.
- Get a permanent `WHATSAPP_ACCESS_TOKEN`.
- Copy your `WHATSAPP_PHONE_NUMBER_ID`.
- Add recipient numbers to allowed/test recipients (if still in test mode).
- (Recommended for production) create and approve a message template for OTP.

### 3) Template vs plain text behavior

The service supports two modes:
- **Template mode**: set `WHATSAPP_OTP_TEMPLATE_NAME`. The OTP code is injected as body parameter `{{1}}`.
- **Text mode**: if template name is empty, service sends plain text message.

For production accounts, template mode is usually required by WhatsApp policy.

### 4) Test flow

1. Start API:
   ```bash
   npm run start:dev
   ```
2. Request OTP:
   - `POST /auth/otp/request`
   - body: `{ "phone": "+65XXXXXXXX" }`
3. Verify OTP:
   - `POST /auth/otp/verify`
   - body: `{ "phone": "+65XXXXXXXX", "code": "123456" }`

### 5) Troubleshooting

- **No message received**
  - Confirm `WHATSAPP_ACCESS_TOKEN` is valid and not expired.
  - Confirm phone is in correct international format.
  - Confirm recipient is allowed (sandbox/test mode).
- **API error from WhatsApp**
  - Check server logs (`WhatsappOtpService`) for response details.
  - Verify API version and phone number ID.
- **Frontend blocked by CORS**
  - Add your web origin to `CLIENT_WEB_ORIGIN` (comma-separated supported).

## Deployment

When you're ready to deploy your NestJS application to production, there are some key steps you can take to ensure it runs as efficiently as possible. Check out the [deployment documentation](https://docs.nestjs.com/deployment) for more information.

If you are looking for a cloud-based platform to deploy your NestJS application, check out [Mau](https://mau.nestjs.com), our official platform for deploying NestJS applications on AWS. Mau makes deployment straightforward and fast, requiring just a few simple steps:

```bash
$ npm install -g @nestjs/mau
$ mau deploy
```

With Mau, you can deploy your application in just a few clicks, allowing you to focus on building features rather than managing infrastructure.

## Resources

Check out a few resources that may come in handy when working with NestJS:

- Visit the [NestJS Documentation](https://docs.nestjs.com) to learn more about the framework.
- For questions and support, please visit our [Discord channel](https://discord.gg/G7Qnnhy).
- To dive deeper and get more hands-on experience, check out our official video [courses](https://courses.nestjs.com/).
- Deploy your application to AWS with the help of [NestJS Mau](https://mau.nestjs.com) in just a few clicks.
- Visualize your application graph and interact with the NestJS application in real-time using [NestJS Devtools](https://devtools.nestjs.com).
- Need help with your project (part-time to full-time)? Check out our official [enterprise support](https://enterprise.nestjs.com).
- To stay in the loop and get updates, follow us on [X](https://x.com/nestframework) and [LinkedIn](https://linkedin.com/company/nestjs).
- Looking for a job, or have a job to offer? Check out our official [Jobs board](https://jobs.nestjs.com).

## Support

Nest is an MIT-licensed open source project. It can grow thanks to the sponsors and support by the amazing backers. If you'd like to join them, please [read more here](https://docs.nestjs.com/support).

## Stay in touch

- Author - [Kamil Myśliwiec](https://twitter.com/kammysliwiec)
- Website - [https://nestjs.com](https://nestjs.com/)
- Twitter - [@nestframework](https://twitter.com/nestframework)

## License

Nest is [MIT licensed](https://github.com/nestjs/nest/blob/master/LICENSE).
