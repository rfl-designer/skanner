/* Skanner · Curso de TypeScript — widget de quiz reusável.
   Componente compartilhado: TODA lição faz <script src> para este arquivo.

   Marcação declarativa (a lição só escreve HTML, sem JS):

     <div class="quiz" data-quiz>
       <p class="q"><span class="num">P1</span> Enunciado…</p>
       <button class="quiz-option" data-correct>Alternativa certa</button>
       <button class="quiz-option">Alternativa errada</button>
       <p class="quiz-explain">Por que a resposta certa é certa.</p>
     </div>

   Feedback é imediato (clicou → marca certo/errado, revela a explicação).
   "Tentar de novo" reseta para reforçar a recuperação da memória (storage strength). */

(function () {
  function wire(quiz) {
    var options = Array.prototype.slice.call(quiz.querySelectorAll(".quiz-option"));
    var explain = quiz.querySelector(".quiz-explain");

    function lock(chosen) {
      options.forEach(function (opt) {
        opt.disabled = true;
        var isCorrect = opt.hasAttribute("data-correct");
        if (isCorrect) {
          opt.classList.add("correct");
          opt.insertAdjacentHTML("beforeend", '<span class="mark">✓</span>');
        }
        if (opt === chosen && !isCorrect) {
          opt.classList.add("wrong");
          opt.insertAdjacentHTML("beforeend", '<span class="mark">✗</span>');
        }
      });
      if (explain) explain.classList.add("show");

      if (!quiz.querySelector(".quiz-reset")) {
        var reset = document.createElement("button");
        reset.className = "quiz-reset";
        reset.textContent = "↺ tentar de novo";
        reset.addEventListener("click", function () { restore(); });
        quiz.appendChild(reset);
      }
    }

    function restore() {
      options.forEach(function (opt) {
        opt.disabled = false;
        opt.classList.remove("correct", "wrong");
        var mark = opt.querySelector(".mark");
        if (mark) mark.remove();
      });
      if (explain) explain.classList.remove("show");
      var reset = quiz.querySelector(".quiz-reset");
      if (reset) reset.remove();
    }

    options.forEach(function (opt) {
      opt.addEventListener("click", function () { lock(opt); });
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    var quizzes = document.querySelectorAll("[data-quiz]");
    Array.prototype.forEach.call(quizzes, wire);
  });
})();
