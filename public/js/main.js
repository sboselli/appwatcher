function typeSelected(elem) {
	var selected = elem.options[elem.selectedIndex];

	var optsIcmp = document.getElementsByClassName("options-icmp");
	var optsHttp = document.getElementsByClassName("options-http");

	var lenIcmp = optsIcmp.length;
	var lenHttp = optsHttp.length;

	if (selected.value == 'icmp') {
		for (var i = 0; i < lenHttp; i++) {
			optsHttp[i].style.display = "none";
		}
		for (var j = 0; j < lenIcmp; j++) {
			optsIcmp[j].style.display = "block";
		}
	}
	if (selected.value == 'http') {
		for (var j = 0; j < lenIcmp; j++) {
			optsIcmp[j].style.display = "none";
		}
		for (var i = 0; i < lenHttp; i++) {
			optsHttp[i].style.display = "block";
		}
	}
}
function groupSelected(elem) {
  var groupName = elem.options[elem.selectedIndex].text;

  var hidden = document.getElementsByName("groupname");
  hidden[0].value = groupName
}