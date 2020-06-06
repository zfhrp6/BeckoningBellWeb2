import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'
import * as Twitter from 'twitter'

admin.initializeApp()

// // Start writing Firebase Functions
// // https://firebase.google.com/docs/functions/typescript
//
// export const helloWorld = functions.https.onRequest((request, response) => {
//  response.send("Hello from Firebase!");
// });


// export const onCreateBellTrigger = functions
//   .region(REGION)
//   .firestore
//   .document('bells/{bellId}')
//   .onCreate((snap, context) => {
//     admin.firestore().collection('bells').doc(snap.id).update({
//       createdAt: admin.firestore.FieldValue.serverTimestamp()
//     }).then((status) => {
//       console.log(status)
//       return 0
//     }).catch((status) => {
//       console.log(status)
//       return 1
//     })
//   })

// export const onUpdateBellTrigger = functions
//   .region(REGION)
//   .firestore
//   .document('bells/{bellId}')
//   .onUpdate((change, context) => {
//     admin.firestore().collection('bells').doc(change.after.id).update({
//       updatedAt: admin.firestore.FieldValue.serverTimestamp()
//     }).then((status) => {
//       console.log(status)
//       return 0
//     }).catch((status) => {
//       console.log(status)
//       return 1
//     })
// })

interface Bell {
  [key: string]: string | FirebaseFirestore.Timestamp,
}

const REGION = 'asia-northeast1'
const RETWEET_INTERVAL = 1 * 60 // seconds
const BELL_ATTR_LIST = ['place', 'password', 'note', 'region', 'silencedAt']

const TwitterClient = new Twitter(functions.config().twitter)

const genTweetUrl = (tweet: Twitter.ResponseData): string => {
  return `https://twitter.com/${tweet.user.screen_name}/status/${tweet.id_str}`
}

const bellDiff = (newBell: FirebaseFirestore.DocumentData, oldBell: FirebaseFirestore.DocumentData) => {
  const ret: Bell = {}
  BELL_ATTR_LIST.forEach((attr) => {
    if (newBell[attr] !== oldBell[attr]) {
      ret[attr] = newBell[attr]
    }
  })
  if (Object.keys(ret).length > 0) {
    return ret
  } else {
    return null
  }
}

export const onCreatedBellTritter = functions
  .region(REGION)
  .firestore
  .document('bells/{bellId}')
  .onCreate((snap, context) => {
    const id = snap.id
    const {place, note} = snap.data() || {}
    const url = `${functions.config().app.base_url}${id}`
    const message = `${place}で鐘を鳴らしています ${url}\n${note}`

    TwitterClient.post('statuses/update', {
      status: message,
    }).then(tweet => {
      const tweetUrl = genTweetUrl(tweet)
      return admin.firestore().collection('bells').doc(snap.id).update({
        tweetUrl: tweetUrl
      })
    }).catch(error => {
      console.error(error)
    })

    return 0
  })

export const onUpdatedBellTrigger = functions
  .region(REGION)
  .firestore
  .document('bells/{bellId}')
  .onUpdate((change, context) => {
    const newData = change.after.data()
    const oldData = change.before.data()

    const diff = bellDiff(newData, oldData)
    const interval = newData.updatedAt.seconds - oldData.updatedAt.seconds

    if (diff) {
      if (diff.silencedAt || interval > RETWEET_INTERVAL) {
        const id = change.after.id
        const { place, note, tweetUrl } = newData || {}
        const url = `${functions.config().app.base_url}${id}`
        const message = diff.silencedAt ?
          `【終了】 募集は終了しました` :
          `【更新】 ${place}で鐘を鳴らしています。 ${url}\n${note}`
        const status = `${message} ${tweetUrl}`
        const tweetId = tweetUrl.match(/\d+$/)[0]

        TwitterClient.post('statuses/update', {
          status: status,
          in_reply_to_status_id: tweetId
        }).catch(error => {
          console.error(error)
        })
      }
    }

    return 0
  })

// debug
export const printenv = functions.region(REGION)
  .https.onRequest((req, res) => {
    console.log('functions.config()', functions.config())
    console.log('process.env', process.env)
    res.send("Please check firebase dashboard.")
  })
