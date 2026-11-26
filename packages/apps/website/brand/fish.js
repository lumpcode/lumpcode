// Shared by the brand renders: adds the Lumpfish symbol (#fish, from app/components/Lumpfish.vue) to the page.
// Fish are drawn with <svg viewBox="0 0 650 540"><use href="#fish" width="650" height="540"/></svg>.
document.body.insertAdjacentHTML('afterbegin', `<svg width="0" height="0" style="position:absolute" aria-hidden="true">
  <defs>
    <clipPath id="body-clip">
      <path d="M298 488C306 352 432 270 566 270C708 270 806 362 826 486C846 616 758 742 612 764C470 786 334 724 302 604C296 566 296 524 298 488Z"/>
    </clipPath>
    <symbol id="fish" viewBox="190 240 650 540">
      <path class="lf-fin" d="M306 520C272 492 236 470 214 478C196 486 196 520 204 552C212 586 206 612 222 622C244 634 278 604 308 576Z"/>
      <path class="lf-line" d="M218 510L276 530M220 552L280 552M222 592L276 572"/>
      <g class="lf-bumps">
        <circle cx="324" cy="436" r="24"/><circle cx="356" cy="364" r="24"/><circle cx="410" cy="310" r="26"/>
        <circle cx="472" cy="280" r="27"/><circle cx="548" cy="268" r="28"/><circle cx="634" cy="290" r="24"/>
      </g>
      <path class="lf-body" d="M298 488C306 352 432 270 566 270C708 270 806 362 826 486C846 616 758 742 612 764C470 786 334 724 302 604C296 566 296 524 298 488Z"/>
      <g clip-path="url(#body-clip)">
        <path class="lf-belly" d="M280 600C340 690 460 712 560 708C660 704 760 660 860 560L860 800L280 800Z"/>
        <path class="lf-cheek" d="M540 560C590 600 660 616 720 604C770 594 812 566 840 530L860 800L520 800C556 720 560 640 540 560Z"/>
      </g>
      <g class="lf-spots">
        <ellipse cx="442" cy="342" rx="15" ry="13"/><ellipse cx="382" cy="400" rx="14" ry="15"/><ellipse cx="346" cy="472" rx="12" ry="14"/>
        <circle cx="410" cy="458" r="9"/><circle cx="476" cy="370" r="7"/><circle cx="516" cy="332" r="7"/>
        <circle cx="524" cy="394" r="7"/><circle cx="392" cy="562" r="8"/>
      </g>
      <g class="lf-pectoral">
        <path class="lf-fin-dark" d="M470 600C462 566 494 552 530 558C562 564 578 586 570 614C562 640 528 648 500 640C482 634 474 620 470 600Z"/>
        <path class="lf-line" d="M482 576L534 586M478 602L536 604M484 626L530 620"/>
      </g>
      <circle class="lf-eye" cx="658" cy="528" r="33"/><circle class="lf-glint" cx="670" cy="514" r="10"/>
      <ellipse class="lf-eye" cx="800" cy="504" rx="22" ry="31"/><circle class="lf-glint" cx="806" cy="492" r="7"/>
    </symbol>
  </defs>
</svg>`)
