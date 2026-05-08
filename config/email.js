const nodemailer = require("nodemailer");
const ejs = require("ejs");
const path = require("path");

const transporter = nodemailer.createTransport({
service:"gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// console.log("ENV CHECK:", {
//   EMAIL_USER: process.env.EMAIL_USER,
//   EMAIL_PASS: process.env.EMAIL_PASS ? "SET" : "MISSING",
// });

const sendMail = async (subject, templateName, templateData) => {
  const templatePath = path.join(
    __dirname,
    "../utils/htmlTemplate",
    `${templateName}.ejs`
  );

  const htmlTemplate = await ejs.renderFile(templatePath, templateData);

  return transporter.sendMail({
    from: process.env.EMAIL_USER,
    to: templateData.to || templateData.email,// or SUPPORT_EMAIL
    subject,
    html: htmlTemplate,
  });
};

module.exports = { sendMail };
