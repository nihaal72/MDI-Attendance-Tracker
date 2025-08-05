const functions = require("firebase-functions");
const admin = require("firebase-admin");
const webpush = require("web-push");

admin.initializeApp();

const db = admin.firestore();

const vapidKeys = {
  publicKey: "BP8kZuyAYxqOUmFll7oImAgNUbvEN3ZcqjFuFZa8Se2C7khqKdbdDg3f2Q64oIFp1lBgwP9rj7AwMgN7x8Lb0V8",
  privateKey: "PvbmeNt-1WuGnn_EubOaVoVkI4uh2ghhuNLrpUR3e-Q",
};

webpush.setVapidDetails(
  "nihaal7272@gmail.com",
  vapidKeys.publicKey,
  vapidKeys.privateKey
);

// This function will run automatically every hour
exports.sendClassReminders = functions.pubsub
  .schedule("every 60 minutes")
  .onRun(async (context) => {
    const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const now = new Date();
    const currentDay = days[now.getDay()];
    const currentHour = now.getHours();

    // Get all users
    const usersSnapshot = await db.collection("artifacts/default-attendance-app/users").get();

    for (const userDoc of usersSnapshot.docs) {
      const userId = userDoc.id;
      const profileData = (await db.doc(`artifacts/default-attendance-app/users/${userId}/profile/info`).get()).data();

      // Check if user has a push subscription
      if (profileData && profileData.pushSubscription) {
        const coursesSnapshot = await db.collection(`artifacts/default-attendance-app/users/${userId}/courses`).get();

        for (const courseDoc of coursesSnapshot.docs) {
          const course = courseDoc.data();

          // Check if the course is scheduled for today
          if (course.schedule && course.schedule.days && course.schedule.days.includes(currentDay)) {
            const classTimeHour = parseInt(course.schedule.time.split(":")[0]);

            // Check if the class is in the next hour
            if (classTimeHour === currentHour + 1) {
               const payload = JSON.stringify({
                title: `Class Reminder: ${course.name}`,
                body: `Your ${course.name} class is starting in about an hour!`,
                icon: "https://placehold.co/192x192/4f46e5/ffffff?text=MDI",
              });

              try {
                await webpush.sendNotification(profileData.pushSubscription, payload);
                console.log(`Sent notification to ${userId} for course ${course.name}`);
              } catch (error) {
                console.error(`Error sending notification to ${userId}:`, error);
                // If subscription is invalid, consider removing it from the database
              }
            }
          }
        }
      }
    }
    return null;
  });