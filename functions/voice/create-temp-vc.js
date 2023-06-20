const lib = require('lib')({token: process.env.STDLIB_SECRET_TOKEN});

let vcHubId = process.env.HUB_ID;

// voice.state.update

// Retrieve voiceData from KV
var voiceData = await lib.utils.kv['@0.1.16'].get({
  key: `voice_${context.params.event.guild_id}`,
  defaultValue: `[]`,
});

// Tries to save the ID of the channel the user just left (as leftVcId), if they havnt just left a VC it will be null
let leftChannelObject = Object.values(voiceData).filter(function (value) {
  return value.userId == `${context.params.event.member.user.id}`;
});
var leftVcId = leftChannelObject[0] ? leftChannelObject[0].channelId : null;
var leftVcInfo = await lib.utils.kv['@0.1.16'].get({
  key: `tempVc_${leftVcId}`,
  defaultValue: {isTemp: false, owner: null},
});

// If the last VC they left was a temp VC
if (leftVcInfo.isTemp) {
  var remainingChannelUsers = Object.values(voiceData).filter(function (value) {
    return (
      value.channelId == `${leftVcId}` &&
      value.userId != `${context.params.event.member.user.id}`
    );
  }); // Filter all the users in the VC excluding the user who left (as they are not there anymore)
  
  //if the leaving user is owner. change owner to null
  if (leftVcInfo.owner == context.params.event.member.user.id && remainingChannelUsers.length > 0) {
    await lib.utils.kv['@0.1.16'].set({
      key: `tempVc_${leftVcId}`,
      value: {isTemp: true, owner: null},
      ttl: 8640, // 1 day
    }); // Change owner to null
  }
  
  if (remainingChannelUsers.length <= 0 && leftVcId != vcHubId && context.params.event.channel_id != leftVcId) {
    // If there is noone else, and a you have left a vc, which is NOT the hub channel, and the joined channel is not leftVc (leftVc is current VC if the user didnt actually leave, e.g, when muting). If all thats true it gets deleted
    try {
      await lib.discord.channels['@0.3.2'].destroy({
        channel_id: `${leftVcId}`,
      });
      await lib.utils.kv['@0.1.16'].clear({
        key: `tempVc_${leftVcId}`,
      });
    } catch (e) {
      console.log(`Error Destroying`);
    }
  }
}

// If channel ID is provided (joining VC or already in VC)
if (context.params.event.channel_id) {
  var voiceValues = Object.values(voiceData).filter(function (value) {
    return value.userId != `${context.params.event.member.user.id}`;
  }); // Sets voiceValues as all the users in any VC excluding the user, this is used as a reset before we add the user to the array. Its expected that this will do nothing to the array as the user shouldnt be there yet

  let currentInfo = {
    userId: `${context.params.event.member.user.id}`,
    channelId: `${context.params.event.channel_id}`,
  }; // Create an object with userId and channelID

  if (
    context.params.event.channel_id == `${vcHubId}` /* && !leftVcInfo.isTemp*/
  ) {

    let hubInfo = await lib.discord.channels['@0.3.2'].retrieve({
      channel_id: `${vcHubId}`,
    }); // To get the category (parent) info of the HUB

    let tempChannel = await lib.discord.guilds['@0.2.4'].channels.create({
      guild_id: `${context.params.event.guild_id}`,
      name: `🔊・Salon de ${context.params.event.member.user.username}`, // Name
      type: 2, // Voice channel
      parent_id: hubInfo.parent_id ? `${hubInfo.parent_id}` : ``, // Same category as HUB
    });

    try {
      await lib.discord.guilds['@0.2.4'].members.voice.update({
        user_id: `${context.params.event.member.user.id}`,
        guild_id: `${context.params.event.guild_id}`,
        channel_id: `${tempChannel.id}`,
      }); // Move the user to thier new VC
      currentInfo.channelId = tempChannel.id; // Update user's location to the new VC

      await lib.utils.kv['@0.1.16'].set({
        key: `tempVc_${tempChannel.id}`,
        value: {isTemp: true, owner: `${context.params.event.member.user.id}`},
        ttl: 8640, // 1 day
      }); // Set info about the TempVC
    } catch (e) {
      await lib.discord.channels['@0.3.2'].destroy({
        channel_id: `${tempChannel.id}`,
      }); // If there was an error moving the user they may have joined and quickly left the HUB, this will delete the temp VC
      var tempChannelDeleted; // Sets true if the tempVC gets deleted for the reason above
      await lib.utils.kv['@0.1.16'].clear({
        key: `tempVc_${tempChannel.id}`,
      });
    }
  }
  if (!tempChannelDeleted && context.params.event.channel_id != vcHubId) {
    // If the VC was not deleted
    var voiceValues = voiceValues.concat(currentInfo); // Add object to voiceData array (new array called voiceValues) => {}
  }
} else if (!context.params.event.channel_id) {
  // If no channel ID is provided (leaving VC)

  var voiceValues = Object.values(voiceData).filter(function (value) {
    return value.userId != `${context.params.event.member.user.id}`;
  }); // Filter voiceData to remove all objects that have the user, (new array called voiceValues)
}

await lib.utils.kv['@0.1.16'].set({
  key: `voice_${context.params.event.guild_id}`,
  value: voiceValues,
  ttl: 1209600, // 2 weeks
});