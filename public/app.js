/**** SETUP ****/
$(document).ready(function(){
	//connect to socket.io
	var socket = io.connect(window.location.hostname);

	//default view state
	$('.edit-profile-modal').show();
	$('.help-modal').show();
	$('.intro-modal').show();
	$('#town-view').show();
	$('#chat-view, #vote-view, #vote-rundown').hide();

	/***** SIDEBAR *****/
	//navbar functionality
	$(".nav-button").click((event) => {
		if (!$(this).hasClass("active")) {
			//change active view
			$('#town-view, #chat-view, #vote-view').hide();
			let targetView = "#" + $(event.target).attr('id').substring(0, 4) + "-view";
			$(targetView).show();

			//QoL buff for chat view
			if (targetView === "#chat-view") {
				$('#chatroom').scrollTop($('#chatroom')[0].scrollHeight);
			}

			//change active button
			$(".nav-button").removeClass("active");
			$(event.target).addClass("active");
		}
	});

	/**** TOWN ****/
	socket.on('change_population', (data) => {
		$('#population-indicator').html(data.population);
	});

	socket.on('change_gdp', (data) => {
		$('#gdp-indicator').html(data.gdp);
	});

	socket.on('change_town_score', (data) => {
		$('#city-score-indicator').html(data.town_score);
		let saturateValue = 120 + (data.town_score * 0.75);
		$('#city').css('filter', `saturate(${saturateValue}%)`);
	});

	/**** CHAT ****/

	//emit message
	function sendMessage() {
		if ($('#message-input').val() !== '') {
			socket.emit('new_message', {
				message: $('#message-input').val()
			});
			$('#message-input').val('');
			$('#chatroom').scrollTop($('#chatroom')[0].scrollHeight);
		}
	}

	//send message when enter is pressed on input
	$("#message-input").on('keyup', function (event) {
		if (event.keyCode === 13) {
			event.preventDefault();
			sendMessage();
		}
	});

	//send message when send button is clicked
	$("#send-message").click(function () {
		event.preventDefault();
		sendMessage();
	});

	//listen on new messages
	socket.on('new_message', (data) => {
		let message =
			`<div class="message-container">
					<img class="profile-thumb" src="${data.thumbnail}">
					<div class="message-bubble">
						<p class="username">${data.username}</p>
						<p class="message-content">${data.message}</p>
					</div>
				</div>`;

		$(message).insertBefore("#chatroom-buffer");
	});

	//focus onto message input when on chat view
	$(document).on('keydown', (event) => {
		if ($('#chat-view').css('display') !== 'none') {
			$('#message-input').focus();
		}
	});

	/**** VOTE ****/
	$('#issue-container').on('click', '.vote-option', (event) => {
		let target = $(event.target);
		if($('.vote-option').hasClass('selected')) {
			$('.vote-option').removeClass('selected');
			(target.hasClass('vote-option')) ? target.addClass('selected') : target.parent().addClass('selected');
			socket.emit('client-vote', {decision: $('.vote-option.selected').attr('id')});
		} else {
			(target.hasClass('vote-option')) ? target.addClass('selected') : target.parent().addClass('selected');
			console.log('Voting for the first time!');
			socket.emit('client-vote:first', {decision: $('.vote-option.selected').attr('id')});
		}
	});

	socket.on('new-issue', (data) => {
		let issueContainer = `
							<h5 id="issue-title">${data.title}</h5>
							<p id="issue-description">${data.description}</p>

							<div class="vote-option" id="option-A">
								<p>${data.optionTitleA}</p>
								<div class="tooltip-button">
									<p>?</p>
									<span class="tooltip-text">${data.optionTooltipA}</span>
								</div>
							</div>

							<div class="vote-option" id="option-B">
									<p>${data.optionTitleB}</p>
								<div class="tooltip-button"">
									<p>?</p>
									<div class="tooltip-text">${data.optionTooltipB}</div>
								</div>
							</div>
							`;
		let tooltipMessageA = `${data.optionTooltipA}`;
		let tooltipMessageB = `${data.optionTooltipB}`;
		$('#issue-container').html(issueContainer);
	});

	socket.on('change_town_score', (data) => {
		$('#town-score-indicator').html(data.town_score);
	});

	/**** Countdown ****/
	socket.on('time', (data) => {
		$('.vote-countdown-timer').html(data.time);
	});

	/**** Countdown Over ****/
	socket.on('vote_finished', (data) => {
		socket.emit('vote_finished', {
			winningOption: data.winningOption,
			voteCount: data.voteCount,
			majorityVotes: data.majorityVotes
		});
	});

	/**** Render Vote Rundown Notification ****/
	socket.on('vote_rundown', (data) => {
		let paragraph1 = `By a majority of <strong>${data.votePercentage}%</strong>, you have voted to <strong>${data.resultTitle}</strong>`
		let paragraph2 = `As a result, ${data.resultMessage} <br> Additionally, everyone gained ${data.votePayout}p for voting!`;

		$('.first-p').html(paragraph1);
		$('.second-p').html(paragraph2);
		$('#vote-rundown').show();
	});

	$('#vote-rundown-close').on('click', (event)=>{
		$('#vote-rundown').hide();
	});


	/******** HELP ********/
	$('#help-open-button').on('click', () => {
		shiftCarouselView(0);
		$('#message-input').attr('disabled', true);
		$('.help-modal').show();
	});

	$('.help-close-button').on('click', () => {
		$('#message-input').attr('disabled', true);
		$('.help-modal').hide();
	});

	const helpModalArray = [
		$('.modal-1'), $('.modal-2'), $('.modal-3'), $('.modal-4'), $('.modal-5')
	];

	let help_i = 0;

	function shiftCarouselView() {
		$('.modal-div').css('visibility', 'hidden');
		helpModalArray[help_i].css('visibility', 'visible');
	}

	$('.help-carousel-prev').on('click', (event) => {
		if (help_i > 0) {
			help_i--;
		} else {
			help_i = helpModalArray.length - 1;
		}
		shiftCarouselView();
	});

	$('.help-carousel-next').on('click', (event) => {
		if (help_i < helpModalArray.length - 1) {
			help_i++;
		} else {
			help_i = 0;
		}
		shiftCarouselView();
	});

	/******** EDIT PROFILE ********/

	/**** Open Edit Profile Modal ****/
	$('#profile-open-button').on('click', () => {
		$('#message-input').attr('disabled', true); //fixes auto-focus issue
		$('.edit-profile-modal').show();
	});

	/**** Close Edit Profile Modal ****/
	$('.profile-close-button').on('click', () => {
		$('#message-input').attr('disabled', false); //fixes auto-focus issue
		$('.edit-profile-modal').hide();
		saveChanges();
	});

	/**** Change Avatar ****/
	/* Avatar Arrays */
	const maleAvatarArray = [
		"m_neutral", "m_specs", "m_patch", "m_shades", "m_monocle",
		"m_goggles", "m_shutters", "m_sporty", "m_nerd", "m_headshades",
		"m_headphones", "m_headband", "m_bowlerhat", "m_partyhat", "m_messengerhat",
		"m_cap", "m_reversecap", "m_beret", "m_bunny", "m_tophat",
		"m_cowboy", "m_alien", "m_witch", "m_beanie", "m_beanie2"
	];

	const femaleAvatarArray = [
		"f_neutral", "f_specs", "f_patch", "f_shades", "f_monocle",
		"f_goggles", "f_shutters", "f_sporty", "f_nerd", "f_headshades",
		"f_headphones", "f_headband", "f_bowlerhat", "f_partyhat", "f_messengerhat",
		"f_cap", "f_reversecap", "f_beret", "f_bunny", "f_tophat",
		"f_cowboy", "f_alien", "f_witch", "f_beanie", "f_beanie2"
	];

	/* Carousel Object :: Turn into actual object */
	let selectedArray = maleAvatarArray;
	let i = 0;
	let selectedImage = `assets/characters/${selectedArray[i]}.svg`;
	let selectedThumb = `assets/thumbnails/${selectedArray[i]}_thumb.svg`;

	function updateCarouselView() {
		$('.carousel-view').css('background-image', `url(${selectedImage})`);
	}

	function updateSelectedImages() {
		selectedImage = `assets/characters/${selectedArray[i]}.svg`;
		selectedThumb = `assets/thumbnails/${selectedArray[i]}_thumb.svg`;
	}

	/* Carousel Initialization */
	updateCarouselView();
	updateSelectedImages();

	function goPrev() {
		if (i > 0) {
			i--;
		} else {
			i = selectedArray.length - 1;
		}
		updateSelectedImages();
		updateCarouselView();
	}

	function goNext() {
		if (i < selectedArray.length - 1) {
			i++;
		} else {
			i = 0;
		}
		updateSelectedImages();
		updateCarouselView();
	}

	/**** Previous/Next Buttons ****/
	$('.profile-carousel-prev').on('click', () => {
		goPrev();
	});

	$('.profile-carousel-next').on('click', () => {
		goNext();
	});

	/**** Gender Button ****/
	$('.carousel-male-button').on('click', () => {
		$('.carousel-female-button').removeClass('selected');
		$('.carousel-male-button').addClass('selected');
		selectedArray = maleAvatarArray;
		updateSelectedImages();
		updateCarouselView();

	});

	$('.carousel-female-button').on('click', () => {
		$('.carousel-male-button').removeClass('selected');
		$('.carousel-female-button').addClass('selected');
		selectedArray = femaleAvatarArray;
		updateSelectedImages();
		updateCarouselView();
	});

	/**** Save Changes ****/
	function saveChanges() {
		//Declare new data
		let newUsername = $('.username-input').val();
		let newAvatar = selectedImage;
		let newThumbnail = selectedThumb;

		//Emit Changes
		socket.emit('edit_profile', {
			username: newUsername,
			avatar: newAvatar,
			thumbnail: newThumbnail
		});

		//Update HUD with changes
		$('.user-info-pp').attr('src', newThumbnail);
		$('.user-info-name').text($(".username-input").val());
	}

	/**** INTRO MODAL ****/
		$('.intro-close-button').on('click', (event) => {
			$('.intro-modal').hide();
		});

		function randomImgSrc() {
			let randomArray = Math.floor(Math.random());
			let randomImage = Math.floor(Math.random() * (selectedArray.length) + 1);

			switch (randomArray) {
				case 0:
					return maleAvatarArray[randomImage];
				case 1:
					return femaleAvatarArray[randomImage];
			}
		}
		$('.intro-modal img').attr('src', `assets/characters/${randomImgSrc()}.svg`);


	/**** HUD money indicator ****/
	socket.on('change_money', (data) => {
		$('.user-info-money').html(data.money + 'p');
	});

	/**** City Interface ****/
	socket.on('place_user_avatar', (data) => {
		let avatar = `<img id="${data._id}" class="city-avatar" src="${data.avatar}">`;
		$('#street').append(avatar);
	});

	socket.on('remove_user_avatar', (data) => {
		$(`#${data._id}`).remove();
	});

	$('#city').on('mousemove', (event) => {
		$('#avatar-tooltip').css({
			left: event.pageX - 75,
			top: event.pageY - 95
		});
	});

	$('#street').on('mouseenter mouseleave', '.city-avatar', (event) => {
		let target = $(event.target);
		let id = target.attr('id');
		if (id != 'street' && id) socket.emit('request-user-info', { _id: id});
		$('#avatar-tooltip').fadeToggle(50);
		socket.on('user-info-tooltip', (data) => {
			$('#avatar-tooltip').html(`<strong>${data.username}</strong> <br> ${data.money}p`);
		});
	});
});