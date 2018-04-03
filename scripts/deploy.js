$(document).ready(function () {

  $("#yes").click(function () {
    var template = $('input#template').val();
    var guid = $('input#guid').val();
    var sco = $('input#sco').val();
    
    window.location.href = '/deploying?template=' + template + '&guid=' + guid + '&sco=' + sco;
  });

  $("#no").click(function () {
    window.location.href = "/";
  });
});